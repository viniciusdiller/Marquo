import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { Prisma } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { isPlausibleBrazilianPhone, normalizePhone } from "../common/utils/phone.util";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { LOCKOUT_THRESHOLD, lockoutDurationMs } from "../common/utils/lockout.util";
import {
  ChangeConsumerPasswordDto,
  ConsumerLoginDto,
  RegisterConsumerDto,
  UpdateConsumerProfileDto,
} from "./dto/consumer-dtos";
import { AuthenticatedConsumer, ConsumerJwtPayload, passwordVersion } from "./types/consumer-auth-user";
import { ConsumerEmailCodeService } from "./consumer-email-code.service";

// Validade de cada sessão/token e também o que o JWT carrega em `exp`. Sozinho seria só um
// prazo fixo mais curto que os 30 dias de antes — o que faz a sessão "nunca sair" é o
// proxy.ts do frontend chamando refresh() perto do vencimento (ver ConsumerAuthService.refresh),
// empurrando expiresAt mais 14 dias a cada uso. Quem some por mais de 14 dias precisa logar de
// novo — isso é aceitável (ficar inativo, não estar usando o app).
const SESSION_TTL_DAYS = 14;
const BCRYPT_ROUNDS = 12;

// ConsumerSession nunca é apagada no fluxo normal (login cria, logout/troca de senha só marcam
// revokedAt) — cresce uma linha por login, pra sempre, sem valor nenhum passada essa janela
// (diferente de Appointment/Ticket, nada financeiro/comissão depende dela). Retenção generosa:
// não há exigência de compliance aqui, só sobra pra investigar um dispositivo suspeito.
const SESSION_RETENTION_DAYS = 90;

// Hash fixo (calculado uma vez, no boot) só pra rodar bcrypt.compare contra ele quando não há
// conta/senha ou a conta está travada — mesmo custo de CPU de uma comparação real, senão o
// tempo de resposta denuncia o que a mensagem esconde. Instância própria (não compartilhada
// com AuthService): as duas identidades não devem ter o mesmo perfil de timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-attack-mitigation", BCRYPT_ROUNDS);

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ConsumerAuthService {
  private readonly logger = new Logger(ConsumerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailCodes: ConsumerEmailCodeService,
  ) {}

  // Cadastro E reivindicação de conta antiga, no mesmo formulário: se o telefone já tinha
  // cadastro sem senha (Consumer do fluxo antigo) ou só histórico de Client em algum salão, a
  // conta é reivindicada e o backfill liga os agendamentos antigos. Quem já tem senha recebe
  // 409 — nunca sobrescreve a senha de outra pessoa. Trade-off consciente (UX vs. segurança):
  // o cadastro revela se telefone/e-mail já têm conta; isso é aceito AQUI e não no login, onde
  // toda falha devolve o mesmo 401. Sem OTP (v1), possuir o telefone basta pra reivindicar.
  async register(dto: RegisterConsumerDto, userAgent?: string) {
    if (!dto.consent) {
      throw new BadRequestException("É necessário aceitar os termos e a política de privacidade.");
    }
    const phone = this.normalize(dto.phone);
    const email = dto.email.trim().toLowerCase();

    // Antes de qualquer custo: o e-mail precisa ser de quem está se cadastrando. Com e-mail configurado o código é
    // obrigatório; sem e-mail em produção o cadastro é recusado (não há como entregar o código).
    const codeMode = this.emailCodes.mode();
    if (codeMode === "unavailable") {
      throw new ServiceUnavailableException("Não foi possível concluir o cadastro agora. Tente novamente mais tarde.");
    }
    if (codeMode === "required" && (await this.emailCodes.check(email, dto.emailCode ?? "")) !== "ok") {
      throw new BadRequestException("Código inválido ou expirado. Peça um novo código.");
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const consumer = await this.prisma.$transaction(async (tx) => {
      const byPhone = await tx.consumer.findUnique({ where: { phone } });
      if (byPhone?.passwordHash) {
        throw new ConflictException("Já existe uma conta com esse telefone. Faça login.");
      }

      const emailOwner = await tx.consumer.findUnique({ where: { email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== byPhone?.id) {
        throw new ConflictException("Este e-mail já está em uso.");
      }

      const target = byPhone
        ? await tx.consumer.update({ where: { id: byPhone.id }, data: { passwordHash, email } })
        : await tx.consumer.create({
            data: { phone, name: dto.name.trim(), email, passwordHash, consentedAt: new Date() },
          });

      await this.backfillCrossTenantLinks(tx, target.id, phone);
      return target;
    });

    // Cadastro concluído: o código é de uso único.
    return this.issueSession(consumer, userAgent);
  }

  // Única etapa que confere credencial. Identificador inválido, conta inexistente, conta sem
  // senha (ainda não reivindicada), conta travada e senha errada são indistinguíveis por
  // mensagem, status e tempo.
  async login(dto: ConsumerLoginDto, userAgent?: string) {
    const consumer = await this.findByIdentifier(dto.identifier);

    if (!consumer || !consumer.passwordHash) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException("Credenciais inválidas.");
    }

    if (consumer.lockedUntil && consumer.lockedUntil.getTime() > Date.now()) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException("Credenciais inválidas.");
    }

    const matches = await bcrypt.compare(dto.password, consumer.passwordHash);
    if (!matches) {
      await this.registerFailedLogin(consumer.id);
      throw new UnauthorizedException("Credenciais inválidas.");
    }

    if (consumer.failedLoginAttempts > 0 || consumer.lockedUntil) {
      await this.prisma.consumer.update({
        where: { id: consumer.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return this.issueSession(consumer, userAgent);
  }

  async me(auth: AuthenticatedConsumer) {
    const consumer = await this.prisma.consumer.findUniqueOrThrow({
      where: { id: auth.consumerId },
      select: { id: true, name: true, phone: true, email: true },
    });
    return consumer;
  }

  // Salões onde este consumidor já agendou (um vínculo por salão), paginados no banco — o
  // "me" não devolve mais essa lista inteira, que crescia sem teto.
  async listEstablishments(auth: AuthenticatedConsumer, query: PaginationQueryDto) {
    const pagination = resolvePagination(query);
    const where = { consumerId: auth.consumerId };
    const [total, links] = await Promise.all([
      this.prisma.consumerTenantLink.count({ where }),
      this.prisma.consumerTenantLink.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: { tenant: { select: { name: true, slug: true, logoUrl: true } } },
      }),
    ]);
    return toPage(
      links.map((link) => link.tenant),
      total,
      pagination,
    );
  }

  // Telefone não é editável aqui: é a chave de identidade usada pra ligar Client de tenants
  // diferentes, mudar isso silenciosamente orfanaria o vínculo.
  async updateProfile(auth: AuthenticatedConsumer, dto: UpdateConsumerProfileDto) {
    const data: Prisma.ConsumerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();

    return this.prisma.consumer.update({
      where: { id: auth.consumerId },
      data,
      select: { id: true, name: true, phone: true, email: true },
    });
  }

  async changePassword(auth: AuthenticatedConsumer, dto: ChangeConsumerPasswordDto, userAgent?: string) {
    const consumer = await this.prisma.consumer.findUniqueOrThrow({ where: { id: auth.consumerId } });
    const matches = consumer.passwordHash
      ? await bcrypt.compare(dto.currentPassword, consumer.passwordHash)
      : false;
    if (!matches) {
      throw new BadRequestException("Senha atual incorreta.");
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.consumer.update({ where: { id: consumer.id }, data: { passwordHash } });
    // Revoga TODOS os dispositivos (a senha pode ter vazado com a sessão junto) e emite uma
    // sessão nova só pra quem trocou, pra continuar logado neste dispositivo sem precisar
    // logar de novo. `pv` (derivado do hash) já invalidaria os tokens antigos por si só; revogar
    // a linha explicitamente também é o que faz a lista de dispositivos refletir a troca.
    await this.prisma.consumerSession.updateMany({
      where: { consumerId: consumer.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { updated: true, ...(await this.issueSession({ ...consumer, passwordHash }, userAgent)) };
  }

  // LGPD: exclusão da conta global. Os Client por tenant permanecem (histórico do negócio); o
  // vínculo, a identidade global e as sessões (onDelete: Cascade) somem.
  async deleteAccount(auth: AuthenticatedConsumer) {
    await this.prisma.consumer.delete({ where: { id: auth.consumerId } });
    return { deleted: true };
  }

  // Chamado pelo proxy.ts (frontend) perto do vencimento do token, em navegação normal — é o que
  // faz a sessão parecer nunca expirar enquanto o cliente volta ao site dentro da janela. O
  // guard já validou a sessão (existe, não revogada, não expirada) antes de chegar aqui.
  async refresh(auth: AuthenticatedConsumer) {
    const session = await this.prisma.consumerSession.update({
      where: { id: auth.sessionId },
      data: { lastSeenAt: new Date(), expiresAt: this.sessionExpiry() },
      include: { consumer: { select: { id: true, name: true, phone: true, email: true, passwordHash: true } } },
    });
    return this.signSession(session.consumer, session.id);
  }

  // Sessões ativas (não revogadas, não expiradas) do consumidor logado, mais recente primeiro.
  // Sem paginação de propósito: é a lista de dispositivos de UM usuário, naturalmente pequena —
  // foge da convenção geral de paginação do projeto, mas não há necessidade real de tetos aqui.
  async listSessions(auth: AuthenticatedConsumer) {
    const sessions = await this.prisma.consumerSession.findMany({
      where: { consumerId: auth.consumerId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
    });
    return sessions.map((session) => ({ ...session, current: session.id === auth.sessionId }));
  }

  // Dono no WHERE (nunca busca por id e compara depois) — sessão de outro consumidor cai no
  // mesmo NotFoundException de "não existe", sem vazar se aquele id pertence a alguém.
  async revokeSession(auth: AuthenticatedConsumer, sessionId: string) {
    const result = await this.prisma.consumerSession.updateMany({
      where: { id: sessionId, consumerId: auth.consumerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Sessão não encontrada.");
    }
    return { revoked: true };
  }

  // "Sair de todos os outros dispositivos" — nunca revoga a própria sessão em uso.
  async revokeOtherSessions(auth: AuthenticatedConsumer) {
    const result = await this.prisma.consumerSession.updateMany({
      where: { consumerId: auth.consumerId, revokedAt: null, id: { not: auth.sessionId } },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  // Housekeeping, não domínio de negócio: apaga fisicamente sessão revogada/expirada há mais de
  // SESSION_RETENTION_DAYS. "Revogada há X" e "nunca revogada mas expirada há X" são os dois
  // jeitos de uma sessão estar morta há tempo suficiente — sessão ativa (revokedAt null e
  // expiresAt no futuro) nunca cai aqui, não importa a idade de createdAt.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredSessions() {
    const cutoff = new Date(Date.now() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.prisma.consumerSession.deleteMany({
      where: {
        OR: [{ revokedAt: { lt: cutoff } }, { AND: [{ revokedAt: null }, { expiresAt: { lt: cutoff } }] }],
      },
    });
    if (result.count > 0) {
      this.logger.log(`Limpeza de ConsumerSession: ${result.count} sessão(ões) removida(s).`);
    }
    return result.count;
  }

  // Garante um Client no tenant e o vínculo com o consumidor. Chamado no agendamento e na
  // lista de espera. Idempotente por [tenantId, phone] / [consumerId, tenantId]. Aceita o
  // client transacional pra participar da transação de quem chama.
  async ensureLink(db: Db, consumerId: string, tenantId: string) {
    const consumer = await db.consumer.findUniqueOrThrow({ where: { id: consumerId } });

    const client = await db.client.upsert({
      where: { tenantId_phone: { tenantId, phone: consumer.phone } },
      update: { name: consumer.name },
      create: { tenantId, phone: consumer.phone, name: consumer.name },
    });
    await db.consumerTenantLink.upsert({
      where: { consumerId_tenantId: { consumerId, tenantId } },
      update: {},
      create: { consumerId, tenantId, clientId: client.id },
    });
    return client;
  }

  // Exceção deliberada e estreita à regra "sempre filtrar por tenantId": o propósito desta
  // query É unificar os registros do DONO deste telefone entre tenants — ele acabou de provar
  // posse do número completando o fluxo de login. Roda só na migração, nunca numa rota que
  // aceite telefone arbitrário de terceiro. NÃO altera Client.name (diferente do ensureLink,
  // que resincroniza o nome a cada agendamento): um backfill em lote não deve pisar em nome
  // que o staff de cada salão personalizou na própria ficha.
  private async backfillCrossTenantLinks(tx: Db, consumerId: string, phone: string) {
    const clients = await tx.client.findMany({ where: { phone }, select: { id: true, tenantId: true } });
    for (const client of clients) {
      await tx.consumerTenantLink.upsert({
        where: { consumerId_tenantId: { consumerId, tenantId: client.tenantId } },
        update: {},
        create: { consumerId, tenantId: client.tenantId, clientId: client.id },
      });
    }
  }

  private async registerFailedLogin(consumerId: string) {
    // Incremento atômico no banco (ver AuthService.registerFailedLogin): "lê, soma em
    // memória, grava" perde tentativas sob força bruta concorrente e o lockout nunca dispara.
    const updated = await this.prisma.consumer.update({
      where: { id: consumerId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    if (updated.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
      await this.prisma.consumer.update({
        where: { id: consumerId },
        data: { lockedUntil: new Date(Date.now() + lockoutDurationMs(updated.failedLoginAttempts)) },
      });
    }
  }

  private sessionExpiry(): Date {
    return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  // Cria a linha ConsumerSession (um dispositivo/login) e assina o token com o `sid` dela.
  // userAgent é só um rótulo de exibição na lista de dispositivos — nunca usado pra decisão de
  // segurança (o navegador informa o valor, não é confiável como identidade).
  private async issueSession(
    consumer: { id: string; name: string; phone: string; email: string | null; passwordHash: string | null },
    userAgent?: string,
  ) {
    const session = await this.prisma.consumerSession.create({
      data: { consumerId: consumer.id, userAgent: userAgent?.slice(0, 300), expiresAt: this.sessionExpiry() },
      select: { id: true },
    });
    return this.signSession(consumer, session.id);
  }

  private signSession(
    consumer: { id: string; name: string; phone: string; email: string | null; passwordHash: string | null },
    sessionId: string,
  ) {
    const payload: ConsumerJwtPayload = {
      sub: consumer.id,
      type: "consumer",
      pv: passwordVersion(consumer.passwordHash),
      sid: sessionId,
    };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: `${SESSION_TTL_DAYS}d` }),
      consumer: { id: consumer.id, name: consumer.name, phone: consumer.phone, email: consumer.email },
    };
  }

  // E-mail (tem "@") ou telefone. Telefone implausível não lança 400: devolve null e cai no
  // mesmo caminho de "conta inexistente" (compare dummy + 401 genérico).
  private async findByIdentifier(identifier: string) {
    const value = identifier.trim();
    if (value.includes("@")) {
      return this.prisma.consumer.findUnique({ where: { email: value.toLowerCase() } });
    }
    const phone = normalizePhone(value);
    if (!isPlausibleBrazilianPhone(phone)) return null;
    return this.prisma.consumer.findUnique({ where: { phone } });
  }

  private normalize(raw: string) {
    const phone = normalizePhone(raw);
    if (!isPlausibleBrazilianPhone(phone)) {
      throw new BadRequestException("Telefone inválido.");
    }
    return phone;
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WaitlistStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { ConsumerAuthService } from "../consumer-auth/consumer-auth.service";
import { AuthenticatedConsumer } from "../consumer-auth/types/consumer-auth-user";
import { computeBillingStatus, hasBillingAccess } from "../billing/billing-status.util";
import { CreateWaitlistEntryDto } from "./dto/create-waitlist-entry.dto";
import type { WaitlistFilter } from "./dto/find-waitlist-query.dto";

// Andamento de uma solicitação. "Encerrado" (resolvido ou cancelado) é final: reabrir uma vaga é uma nova solicitação do cliente.
// Aguardando e contatado alternam (o cliente não respondeu: volta a aguardando). Antes qualquer mudança era aceita, inclusive
// ressuscitar uma solicitação resolvida.
const ALLOWED_TRANSITIONS: Record<WaitlistStatus, WaitlistStatus[]> = {
  [WaitlistStatus.PENDING]: [WaitlistStatus.CONTACTED, WaitlistStatus.RESOLVED, WaitlistStatus.CANCELED],
  [WaitlistStatus.CONTACTED]: [WaitlistStatus.PENDING, WaitlistStatus.RESOLVED, WaitlistStatus.CANCELED],
  [WaitlistStatus.RESOLVED]: [],
  [WaitlistStatus.CANCELED]: [],
};

const ACTIVE_STATUSES: WaitlistStatus[] = [WaitlistStatus.PENDING, WaitlistStatus.CONTACTED];
const CLOSED_STATUSES: WaitlistStatus[] = [WaitlistStatus.RESOLVED, WaitlistStatus.CANCELED];

export interface WaitlistEntryView {
  id: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  professionalName: string | null;
  preferredDate: string | null;
  notes: string | null;
  status: WaitlistStatus;
  createdAt: string;
}

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consumerAuth: ConsumerAuthService,
  ) {}

  async createFromPublicLink(
    tenantSlug: string,
    dto: CreateWaitlistEntryDto,
    consumer: AuthenticatedConsumer,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }
    await this.assertTenantAcceptsBookings(tenant.id);

    // serviceId/professionalId vêm do body do link público sem nenhuma relação de FK que
    // force os dois a serem do mesmo tenant — sem essa checagem, um cliente podia entrar na
    // lista de espera do tenant A referenciando o serviço/profissional de outro tenant B, e
    // esse nome de outro negócio vazaria pro dono do tenant A em findAllByTenant (include de
    // service/professional).
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId: tenant.id, isActive: true },
      select: { id: true },
    });
    if (!service) {
      throw new BadRequestException("Serviço não encontrado.");
    }
    if (dto.professionalId) {
      const professional = await this.prisma.professional.findFirst({
        where: { id: dto.professionalId, tenantId: tenant.id, isActive: true },
        select: { id: true },
      });
      if (!professional) {
        throw new BadRequestException("Profissional não encontrado.");
      }
    }

    const client = await this.consumerAuth.ensureLink(this.prisma, consumer.consumerId, tenant.id);
    const preferredDate = dto.preferredDate ? new Date(dto.preferredDate) : null;

    // A mesma pessoa não entra duas vezes para o mesmo serviço, profissional e dia enquanto a solicitação anterior estiver ativa
    // (aguardando ou contatada): devolve a que já existe. O lock por cliente serializa dois cliques/requisições simultâneos.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`waitlist:${tenant.id}:${client.id}`})::bigint)`;
      const existing = await tx.waitlistEntry.findFirst({
        where: {
          tenantId: tenant.id,
          clientId: client.id,
          serviceId: dto.serviceId,
          professionalId: dto.professionalId ?? null,
          preferredDate,
          status: { in: ACTIVE_STATUSES },
        },
      });
      if (existing) return { ...existing, alreadyWaiting: true };

      const created = await tx.waitlistEntry.create({
        data: {
          tenantId: tenant.id,
          serviceId: dto.serviceId,
          professionalId: dto.professionalId,
          clientName: client.name,
          clientPhone: client.phone,
          clientId: client.id,
          preferredDate: preferredDate ?? undefined,
          notes: dto.notes,
        },
      });
      return { ...created, alreadyWaiting: false };
    });
  }

  // Lista da equipe, dos mais antigos para os mais novos (quem espera há mais tempo aparece primeiro). Resposta EXPLÍCITA: só o que a
  // tela mostra (nada de campos internos do profissional). "CLOSED" junta resolvidos e cancelados.
  async findAllByTenant(tenantId: string, filter?: WaitlistFilter): Promise<WaitlistEntryView[]> {
    const rows = await this.prisma.waitlistEntry.findMany({
      where: { tenantId, ...statusWhere(filter) },
      select: {
        id: true,
        clientId: true,
        clientName: true,
        clientPhone: true,
        preferredDate: true,
        notes: true,
        status: true,
        createdAt: true,
        service: { select: { name: true } },
        professional: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      serviceName: row.service.name,
      professionalName: row.professional?.user.name ?? null,
      // `preferredDate` é @db.Date (só o dia): devolve "AAAA-MM-DD", sem fuso para o navegador reinterpretar.
      preferredDate: row.preferredDate ? row.preferredDate.toISOString().slice(0, 10) : null,
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // Contagens para as abas do painel (uma consulta só).
  async counts(tenantId: string): Promise<{ pending: number; contacted: number; closed: number }> {
    const groups = await this.prisma.waitlistEntry.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } });
    const of = (status: WaitlistStatus) => groups.find((g) => g.status === status)?._count._all ?? 0;
    return {
      pending: of(WaitlistStatus.PENDING),
      contacted: of(WaitlistStatus.CONTACTED),
      closed: of(WaitlistStatus.RESOLVED) + of(WaitlistStatus.CANCELED),
    };
  }

  // Muda o andamento só por transição permitida. A escrita é ATÔMICA: o status de origem vai no WHERE, então duas pessoas mexendo ao
  // mesmo tempo não atropelam (a segunda recebe 409 em vez de sobrescrever). tenantId no WHERE: registro de outro negócio é 404.
  async updateStatus(tenantId: string, id: string, status: WaitlistStatus) {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { id, tenantId }, select: { status: true } });
    if (!entry) {
      throw new NotFoundException("Registro da lista de espera não encontrado.");
    }
    if (entry.status === status) return this.prisma.waitlistEntry.findFirstOrThrow({ where: { id, tenantId } });

    if (!ALLOWED_TRANSITIONS[entry.status].includes(status)) {
      throw new ConflictException(
        CLOSED_STATUSES.includes(entry.status)
          ? "Esta solicitação já foi encerrada e não pode mudar. Se o cliente quiser de novo, ele entra na lista outra vez."
          : "Essa mudança de andamento não é permitida.",
      );
    }
    const result = await this.prisma.waitlistEntry.updateMany({ where: { id, tenantId, status: entry.status }, data: { status } });
    if (result.count === 0) {
      throw new ConflictException("Esta solicitação acabou de ser alterada por outra pessoa. Atualize a página.");
    }
    return this.prisma.waitlistEntry.findFirstOrThrow({ where: { id, tenantId } });
  }

  // Mesma regra de AppointmentsService.assertTenantAcceptsBookings — a rota pública
  // (@Public()) não passa pelo TenantBillingGuard.
  private async assertTenantAcceptsBookings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { subscription: true },
    });
    const status = computeBillingStatus(tenant, tenant.subscription);
    if (!hasBillingAccess(status)) {
      throw new ForbiddenException("Este negócio não está aceitando novos agendamentos no momento.");
    }
  }
}

function statusWhere(filter?: WaitlistFilter) {
  if (!filter) return {};
  if (filter === "CLOSED") return { status: { in: CLOSED_STATUSES } };
  return { status: filter as WaitlistStatus };
}

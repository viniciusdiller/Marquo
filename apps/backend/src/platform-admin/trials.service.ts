import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";

export const AUDIT_TRIAL_SET = "TRIAL_SET";
export const TRIAL_MAX_DAYS = 365;
const DAY_MS = 86_400_000;

export type TrialStatusFilter = "ACTIVE" | "EXPIRED";

export interface TrialListQuery extends PaginationQueryDto {
  search?: string;
  status?: TrialStatusFilter;
}

const TRIAL_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  trialEndsAt: true,
  suspendedAt: true,
  users: { where: { role: Role.OWNER, isActive: true }, select: { name: true, email: true, phone: true }, take: 1 },
} satisfies Prisma.TenantSelect;

type TrialRow = Prisma.TenantGetPayload<{ select: typeof TRIAL_SELECT }>;

// Dias que faltam (arredondado para cima: "vence daqui a 3 horas" é 1 dia) ou, se já venceu, quantos dias faz (negativo).
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS);
}

function toItem(row: TrialRow, now: Date) {
  const owner = row.users[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    trialEndsAt: row.trialEndsAt,
    daysLeft: trialDaysLeft(row.trialEndsAt, now),
    expired: row.trialEndsAt.getTime() <= now.getTime(),
    suspended: row.suspendedAt !== null,
    owner,
  };
}

// Gestão do teste grátis pela plataforma: ver quanto falta de cada negócio ainda sem assinatura e DEFINIR quanto tempo ele
// tem a partir de hoje (para mais ou para menos). Complementa o "estender" (que só soma dias).
// Vale só para quem não tem assinatura: com assinatura não existe teste (o estado vem da assinatura). O prazo é decidido
// no servidor e a data final nunca vem do cliente: o corpo traz só um número de dias.
@Injectable()
export class TrialsService {
  private readonly logger = new Logger(TrialsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: TrialListQuery, now: Date = new Date()) {
    const pagination = resolvePagination(query);
    const search = query.search?.trim();

    const and: Prisma.TenantWhereInput[] = [{ deletedAt: null }, { subscription: { is: null } }];
    if (query.status === "ACTIVE") and.push({ trialEndsAt: { gt: now } });
    if (query.status === "EXPIRED") and.push({ trialEndsAt: { lte: now } });
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { users: { some: { role: Role.OWNER, email: { contains: search.toLowerCase() } } } },
        ],
      });
    }
    const where: Prisma.TenantWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        // Quem vai vencer primeiro aparece primeiro; na aba de vencidos, os vencidos mais recentes.
        orderBy: { trialEndsAt: query.status === "EXPIRED" ? "desc" : "asc" },
        skip: pagination.skip,
        take: pagination.take,
        select: TRIAL_SELECT,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return toPage(
      rows.map((row) => toItem(row, now)),
      total,
      pagination,
    );
  }

  // Define quanto teste o negócio TEM a partir de agora: `days` dias contados de hoje (0 = encerra agora). Vale para mais
  // ou para menos que o atual, e também reabre um teste já vencido (o acesso é decidido na leitura, pela data).
  async setRemaining(tenantId: string, days: number, actor: string, now: Date = new Date()) {
    // O DTO já barra; repete aqui porque o service é chamado direto em testes e outros pontos.
    if (!Number.isInteger(days) || days < 0 || days > TRIAL_MAX_DAYS) {
      throw new BadRequestException(`Informe de 0 a ${TRIAL_MAX_DAYS} dias.`);
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { trialEndsAt: true, subscription: { select: { id: true } } },
    });
    // Mesmo 404 de negócio inexistente (ou já excluído).
    if (!tenant) throw new NotFoundException("Negócio não encontrado.");
    if (tenant.subscription) {
      throw new ConflictException("Este negócio já tem assinatura: não há período de teste para definir.");
    }

    const next = new Date(now.getTime() + days * DAY_MS);

    // trialEndsAt (e a ausência de assinatura) no WHERE: se outra alteração rodou entre a leitura e a escrita, esta
    // falha em vez de sobrescrever, e a auditoria nunca guarda um valor que não aconteceu.
    const changed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: { id: tenantId, deletedAt: null, trialEndsAt: tenant.trialEndsAt, subscription: { is: null } },
        data: { trialEndsAt: next },
      });
      if (updated.count === 1) {
        await tx.adminAuditLog.create({
          data: {
            action: AUDIT_TRIAL_SET,
            actor,
            tenantId,
            detail: `${days} dia(s) a partir de hoje (de ${tenant.trialEndsAt.toISOString().slice(0, 10)} para ${next.toISOString().slice(0, 10)})`,
          },
        });
      }
      return updated.count;
    });
    if (changed === 0) throw new ConflictException("O período de teste mudou enquanto você definia. Tente de novo.");

    this.logger.log(`Teste do negócio ${tenantId} definido em ${days} dia(s) por ${actor}.`);
    const row = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: TRIAL_SELECT });
    return toItem(row, now);
  }
}

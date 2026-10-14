import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CommissionBase,
  CommissionKind,
  Prisma,
  Role,
  TicketItemKind,
  TicketStatus,
} from "@marquo/database";
import type { EarningsReport, ProfessionalEarnings } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertCommissionRuleDto } from "./dto/upsert-commission-rule.dto";
import { allocateDiscount } from "./discount-allocation.util";

const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
// Teto de regras por profissional: sem ele, um loop de POST enchia a tabela e o fechamento de comanda
// (que carrega as regras do profissional) ficava cada vez mais lento.
const MAX_RULES_PER_PROFESSIONAL = 100;

type RuleForMatch = {
  id: string;
  professionalId: string;
  base: CommissionBase;
  targetId: string | null;
  kind: CommissionKind;
  value: number;
};

type TicketItemForCommission = {
  id: string;
  kind: TicketItemKind;
  serviceId: string | null;
  productId: string | null;
  professionalId: string | null;
  quantity: number;
  unitPriceCents: number;
};

type Caller = { role: Role; professionalId?: string };

// PROFESSIONAL só enxerga o próprio. Se vier PROFESSIONAL sem vínculo (professionalId ausente),
// o filtro NÃO pode sumir (viraria "todos"): nega o acesso.
function resolveScope(
  caller: Caller,
  requestedProfessionalId: string | undefined,
): { professionalId?: string; denied: boolean } {
  if (caller.role !== Role.PROFESSIONAL) {
    return { professionalId: requestedProfessionalId, denied: false };
  }
  return caller.professionalId
    ? { professionalId: caller.professionalId, denied: false }
    : { denied: true };
}

function parseRange(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new BadRequestException("Intervalo inválido.");
  }
  // Sem teto, "1970 → 2100" materializava todas as comissões do tenant numa resposta só.
  if (toDate.getTime() - fromDate.getTime() > MAX_REPORT_RANGE_MS) {
    throw new BadRequestException("Intervalo máximo do relatório é de 366 dias.");
  }
  return { fromDate, toDate };
}

const EMPTY_TOTALS = {
  ticketCount: 0,
  grossCents: 0,
  discountCents: 0,
  netCents: 0,
  commissionCents: 0,
  houseCents: 0,
  payableBalanceCents: 0,
};

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listRules(tenantId: string) {
    return this.prisma.commissionRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createRule(tenantId: string, dto: UpsertCommissionRuleDto) {
    await this.assertValid(tenantId, dto);
    await this.assertNoDuplicate(tenantId, dto, dto.isActive ?? true);
    const count = await this.prisma.commissionRule.count({
      where: { tenantId, professionalId: dto.professionalId },
    });
    if (count >= MAX_RULES_PER_PROFESSIONAL) {
      throw new BadRequestException(
        `Limite de ${MAX_RULES_PER_PROFESSIONAL} regras por profissional. Exclua regras que não usa mais.`,
      );
    }
    return this.prisma.commissionRule.create({
      data: {
        tenantId,
        professionalId: dto.professionalId,
        base: dto.base as CommissionBase,
        targetId: dto.base === "ALL" ? null : (dto.targetId ?? null),
        kind: dto.kind as CommissionKind,
        value: dto.value,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateRule(tenantId: string, id: string, dto: UpsertCommissionRuleDto) {
    const existing = await this.prisma.commissionRule.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException("Regra de comissão não encontrada.");
    }
    await this.assertValid(tenantId, dto);
    // PATCH sem isActive NÃO pode reativar em silêncio uma regra que o dono desligou: o padrão é
    // manter o estado atual (antes era `?? true`).
    const isActive = dto.isActive ?? existing.isActive;
    await this.assertNoDuplicate(tenantId, dto, isActive, id);

    // tenantId também no WHERE da escrita (não só na leitura acima): o isolamento não depende de
    // ninguém ter lembrado de checar antes.
    const { count } = await this.prisma.commissionRule.updateMany({
      where: { id, tenantId },
      data: {
        professionalId: dto.professionalId,
        base: dto.base as CommissionBase,
        targetId: dto.base === "ALL" ? null : (dto.targetId ?? null),
        kind: dto.kind as CommissionKind,
        value: dto.value,
        isActive,
      },
    });
    if (count === 0) throw new NotFoundException("Regra de comissão não encontrada.");
    return this.prisma.commissionRule.findFirstOrThrow({ where: { id, tenantId } });
  }

  // Excluir uma regra só vale para comandas FUTURAS: a CommissionEntry de comandas já fechadas guarda
  // o valor calculado e não referencia a regra, então o histórico e o saldo não mudam.
  async deleteRule(tenantId: string, id: string) {
    const { count } = await this.prisma.commissionRule.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new NotFoundException("Regra de comissão não encontrada.");
    return { deleted: true };
  }

  // O escopo por profissional é forçado AQUI (não só no controller): um PROFESSIONAL nunca
  // deve conseguir ler comissão de outro colega, mesmo que um caller futuro (rota admin,
  // script, teste com mock errado) chame o service direto sem passar pelo controller —
  // mesmo padrão de "o service injeta o filtro quando role === PROFESSIONAL" que
  // AppointmentsService.findOwnedByStaff já usa.
  async report(
    tenantId: string,
    from: string,
    to: string,
    requestedProfessionalId: string | undefined,
    caller: Caller,
  ) {
    const scope = resolveScope(caller, requestedProfessionalId);
    const { fromDate, toDate } = parseRange(from, to);
    if (scope.denied) return { totalCents: 0, byProfessional: [], entries: [] };
    const professionalId = scope.professionalId;

    const entries = await this.prisma.commissionEntry.findMany({
      where: {
        tenantId,
        createdAt: { gte: fromDate, lte: toDate },
        ...(professionalId ? { professionalId } : {}),
      },
      include: {
        professional: { include: { user: { select: { name: true } } } },
        ticketItem: { select: { description: true, kind: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const byProfessional = new Map<
      string,
      { professionalId: string; name: string; totalCents: number; count: number }
    >();
    for (const entry of entries) {
      const key = entry.professionalId;
      const current = byProfessional.get(key) ?? {
        professionalId: key,
        name: entry.professional.user.name,
        totalCents: 0,
        count: 0,
      };
      current.totalCents += entry.amountCents;
      current.count += 1;
      byProfessional.set(key, current);
    }

    return {
      totalCents: entries.reduce((sum, e) => sum + e.amountCents, 0),
      byProfessional: [...byProfessional.values()],
      entries: entries.map((e) => ({
        id: e.id,
        professionalName: e.professional.user.name,
        description: e.ticketItem.description,
        baseCents: e.baseCents,
        amountCents: e.amountCents,
        createdAt: e.createdAt,
      })),
    };
  }

  // Faturamento por profissional, calculado na hora (nada de "fechar período"). A base temporal
  // é UMA só: Ticket.closedAt das comandas FECHADAS — bruto, desconto e comissão do período usam
  // o mesmo corte. O saldo a repassar é acumulado (histórico inteiro), não do período.
  // Lista todo profissional ATIVO (mesmo com zero) pra equipe inteira aparecer sempre.
  async earnings(
    tenantId: string,
    from: string,
    to: string,
    requestedProfessionalId: string | undefined,
    caller: Caller,
  ): Promise<EarningsReport> {
    const { fromDate, toDate } = parseRange(from, to);
    const scope = resolveScope(caller, requestedProfessionalId);
    const empty: EarningsReport = {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      professionals: [],
      totals: { ...EMPTY_TOTALS },
    };
    if (scope.denied) return empty;
    const only = scope.professionalId;

    const closedInRange = {
      status: TicketStatus.CLOSED,
      closedAt: { gte: fromDate, lte: toDate },
    };

    const [grossRows, discountedTickets, commissionRows, accruedRows, paidRows] =
      await Promise.all([
        // Bruto e nº de comandas por profissional. Raw só pra Σ(preço × qtd), que o groupBy do
        // Prisma não expressa; tudo parametrizado pelo template tag.
        this.prisma.$queryRaw<Array<{ professionalId: string; gross: bigint; tickets: bigint }>>`
          SELECT ti."professionalId" AS "professionalId",
                 SUM(ti."unitPriceCents" * ti."quantity")::bigint AS gross,
                 COUNT(DISTINCT ti."ticketId")::bigint AS tickets
          FROM "TicketItem" ti
          JOIN "Ticket" t ON t."id" = ti."ticketId"
          WHERE t."tenantId" = ${tenantId}
            AND t."status" = 'CLOSED'
            AND t."closedAt" >= ${fromDate}
            AND t."closedAt" <= ${toDate}
            AND ti."professionalId" IS NOT NULL
            ${only ? Prisma.sql`AND ti."professionalId" = ${only}` : Prisma.empty}
          GROUP BY ti."professionalId"`,
        // Só as comandas COM desconto precisam de rateio item a item (o desconto é um valor
        // único da comanda e é dividido entre TODOS os itens, inclusive os sem profissional).
        this.prisma.ticket.findMany({
          where: { tenantId, ...closedInRange, discountCents: { gt: 0 } },
          select: {
            discountCents: true,
            items: { select: { professionalId: true, unitPriceCents: true, quantity: true } },
          },
        }),
        this.prisma.commissionEntry.groupBy({
          by: ["professionalId"],
          where: { tenantId, ticket: closedInRange, ...(only ? { professionalId: only } : {}) },
          _sum: { amountCents: true },
        }),
        this.prisma.commissionEntry.groupBy({
          by: ["professionalId"],
          where: { tenantId, ...(only ? { professionalId: only } : {}) },
          _sum: { amountCents: true },
        }),
        this.prisma.commissionPayout.groupBy({
          by: ["professionalId"],
          where: { tenantId, ...(only ? { professionalId: only } : {}) },
          _sum: { amountCents: true },
        }),
      ]);

    const discountByPro = new Map<string, number>();
    for (const ticket of discountedTickets) {
      const shares = allocateDiscount(
        ticket.items.map((i) => i.unitPriceCents * i.quantity),
        ticket.discountCents,
      );
      ticket.items.forEach((item, index) => {
        if (!item.professionalId) return;
        discountByPro.set(
          item.professionalId,
          (discountByPro.get(item.professionalId) ?? 0) + shares[index],
        );
      });
    }

    const sumByPro = (
      rows: Array<{ professionalId: string; _sum: { amountCents: number | null } }>,
    ) => new Map(rows.map((r) => [r.professionalId, r._sum.amountCents ?? 0]));
    const commissionByPro = sumByPro(commissionRows);
    const accruedByPro = sumByPro(accruedRows);
    const paidByPro = sumByPro(paidRows);
    const grossByPro = new Map(grossRows.map((r) => [r.professionalId, Number(r.gross)]));
    const ticketsByPro = new Map(grossRows.map((r) => [r.professionalId, Number(r.tickets)]));

    const withActivity = new Set([
      ...grossByPro.keys(),
      ...accruedByPro.keys(),
      ...paidByPro.keys(),
    ]);
    const professionals = await this.prisma.professional.findMany({
      where: {
        tenantId,
        ...(only ? { id: only } : {}),
        OR: [{ isActive: true }, { id: { in: [...withActivity] } }],
      },
      select: { id: true, isActive: true, user: { select: { name: true } } },
    });

    const rows: ProfessionalEarnings[] = professionals
      .map((p) => {
        const grossCents = grossByPro.get(p.id) ?? 0;
        const discountCents = discountByPro.get(p.id) ?? 0;
        const netCents = grossCents - discountCents;
        const commissionCents = commissionByPro.get(p.id) ?? 0;
        return {
          professionalId: p.id,
          name: p.user.name,
          isActive: p.isActive,
          ticketCount: ticketsByPro.get(p.id) ?? 0,
          grossCents,
          discountCents,
          netCents,
          commissionCents,
          houseCents: netCents - commissionCents,
          payableBalanceCents: (accruedByPro.get(p.id) ?? 0) - (paidByPro.get(p.id) ?? 0),
        };
      })
      .sort((a, b) => b.grossCents - a.grossCents || a.name.localeCompare(b.name, "pt-BR"));

    const totals = rows.reduce(
      (acc, r) => ({
        ticketCount: acc.ticketCount + r.ticketCount,
        grossCents: acc.grossCents + r.grossCents,
        discountCents: acc.discountCents + r.discountCents,
        netCents: acc.netCents + r.netCents,
        commissionCents: acc.commissionCents + r.commissionCents,
        houseCents: acc.houseCents + r.houseCents,
        payableBalanceCents: acc.payableBalanceCents + r.payableBalanceCents,
      }),
      { ...EMPTY_TOTALS },
    );

    return { ...empty, professionals: rows, totals };
  }

  // Chamado dentro da transação de fechamento da comanda. Uma entry por item que casa com
  // a regra mais específica do profissional (target exato > base específica > ALL).
  async computeForTicket(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ticketId: string,
    items: TicketItemForCommission[],
  ) {
    const professionalIds = [
      ...new Set(items.map((i) => i.professionalId).filter((id): id is string => !!id)),
    ];
    if (professionalIds.length === 0) return;

    const rules = (await tx.commissionRule.findMany({
      where: { tenantId, isActive: true, professionalId: { in: professionalIds } },
      // Ordem fixa: se duas regras empatassem na prioridade, a escolha dependeria da ordem que o
      // banco devolve e a mesma venda poderia render comissões diferentes.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as RuleForMatch[];

    const entries: Prisma.CommissionEntryCreateManyInput[] = [];
    for (const item of items) {
      if (!item.professionalId) continue;
      const rule = this.pickRule(rules, item);
      if (!rule) continue;

      const baseCents = item.unitPriceCents * item.quantity;
      const rawAmount =
        rule.kind === CommissionKind.PERCENT
          ? Math.round((baseCents * rule.value) / 100)
          : rule.value * item.quantity;
      // Comissão nunca passa do valor vendido: um "R$ fixo" digitado errado (ex.: 5000,00 em vez de
      // 50,00) geraria repasse maior que a venda e estouraria o caixa.
      const amountCents = Math.min(rawAmount, baseCents);
      if (amountCents <= 0) continue;

      entries.push({
        tenantId,
        professionalId: item.professionalId,
        ticketId,
        ticketItemId: item.id,
        baseCents,
        amountCents,
      });
    }

    if (entries.length > 0) {
      await tx.commissionEntry.createMany({ data: entries });
    }
  }

  private pickRule(rules: RuleForMatch[], item: TicketItemForCommission): RuleForMatch | null {
    const targetId = item.kind === TicketItemKind.SERVICE ? item.serviceId : item.productId;
    const forPro = rules.filter((r) => r.professionalId === item.professionalId);

    const matches = forPro.filter((rule) => {
      if (rule.base === CommissionBase.ALL) return true;
      if (rule.base === CommissionBase.SERVICE && item.kind !== TicketItemKind.SERVICE) return false;
      if (rule.base === CommissionBase.PRODUCT && item.kind !== TicketItemKind.PRODUCT) return false;
      return rule.targetId ? rule.targetId === targetId : true;
    });
    if (matches.length === 0) return null;

    // Prioridade: target exato > base específica (SERVICE/PRODUCT) > ALL.
    const score = (rule: RuleForMatch) =>
      (rule.targetId && rule.targetId === targetId ? 4 : 0) + (rule.base !== CommissionBase.ALL ? 2 : 0);
    return matches.sort((a, b) => score(b) - score(a))[0];
  }

  // Duas regras ativas para o MESMO profissional e alvo empatam na prioridade (pickRule), e o repasse
  // dependeria de qual o banco devolve primeiro. Uma só regra ativa por (profissional, base, alvo).
  private async assertNoDuplicate(
    tenantId: string,
    dto: UpsertCommissionRuleDto,
    willBeActive: boolean,
    excludeId?: string,
  ) {
    if (!willBeActive) return;
    const clash = await this.prisma.commissionRule.findFirst({
      where: {
        tenantId,
        professionalId: dto.professionalId,
        base: dto.base as CommissionBase,
        targetId: dto.base === "ALL" ? null : (dto.targetId ?? null),
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        "Já existe uma regra ativa para este profissional e este alvo. Edite a existente em vez de criar outra.",
      );
    }
  }

  private async assertValid(tenantId: string, dto: UpsertCommissionRuleDto) {
    const professional = await this.prisma.professional.findFirst({
      where: { id: dto.professionalId, tenantId },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException("Profissional não encontrado.");
    }
    // base SERVICE/PRODUCT sem alvo = "qualquer serviço/produto" (nível intermediário de prioridade, entre o
    // alvo exato e "qualquer venda"). O alvo é opcional; quando vem, é validado no tenant logo abaixo.
    // targetId vem do body: sem checar o tenant, a regra podia apontar para um serviço/produto de
    // OUTRO negócio (referência cruzada entre tenants, mesmo que hoje nunca case com um item local).
    if (dto.base !== "ALL" && dto.targetId) {
      const target =
        dto.base === "SERVICE"
          ? await this.prisma.service.findFirst({ where: { id: dto.targetId, tenantId }, select: { id: true } })
          : await this.prisma.product.findFirst({ where: { id: dto.targetId, tenantId }, select: { id: true } });
      if (!target) {
        throw new NotFoundException(
          dto.base === "SERVICE" ? "Serviço não encontrado." : "Produto não encontrado.",
        );
      }
    }
    if (dto.kind === "PERCENT" && dto.value > 100) {
      throw new BadRequestException("Percentual de comissão não pode passar de 100.");
    }
  }
}

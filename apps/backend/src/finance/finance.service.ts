import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import {
  FinancialDirection,
  FinancialEntrySource,
  FinancialEntryStatus,
  PaymentMethod,
  Prisma,
} from "@marquo/database";
import type { CommissionPayout } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import {
  CreateCategoryDto,
  CreateEntryDto,
  RegisterPayoutDto,
  SettleEntryDto,
  UpdateCategoryDto,
  UpdateEntryDto,
} from "./dto/finance-dtos";
import { PayoutsQueryDto } from "./dto/payouts-query.dto";

const PAYOUT_TIMEZONE = "America/Sao_Paulo";
const MAX_PAYOUT_BACKDATE_DAYS = 366;

// Dia do repasse: padrão HOJE em São Paulo. Pode ser corrigido pra um dia passado (pagou ontem e só
// registrou hoje), mas nunca futuro nem muito antigo: data livre sem teto serviria pra empurrar um
// pagamento pra dentro (ou pra fora) de um período já fechado no fluxo de caixa/DRE.
function resolvePayoutDay(paidOn: string | undefined) {
  const today = DateTime.now().setZone(PAYOUT_TIMEZONE).startOf("day");
  const day = paidOn ? DateTime.fromISO(paidOn, { zone: PAYOUT_TIMEZONE }) : today;
  if (!day.isValid) throw new BadRequestException("Data do repasse inválida.");
  if (day > today) throw new BadRequestException("A data do repasse não pode ser futura.");
  if (today.diff(day, "days").days > MAX_PAYOUT_BACKDATE_DAYS) {
    throw new BadRequestException("A data do repasse não pode ser de mais de 366 dias atrás.");
  }
  const isToday = day.hasSame(today, "day");
  return {
    // Hoje: o instante real do pagamento. Dia passado: meio-dia de SP (não vira o dia por fuso).
    paidAt: isToday ? new Date() : day.set({ hour: 12 }).toJSDate(),
    // Coluna @db.Date: meia-noite UTC do dia civil de SP (evita cair no dia seguinte às 22h em SP).
    dueDate: new Date(`${day.toISODate()}T00:00:00.000Z`),
    paidOn: day.toISODate()!,
  };
}

const formatBrl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Criadas na primeira vez que o tenant abre o financeiro.
const DEFAULT_CATEGORIES: Array<{ name: string; direction: FinancialDirection }> = [
  { name: "Vendas de serviços", direction: FinancialDirection.INCOME },
  { name: "Vendas de produtos", direction: FinancialDirection.INCOME },
  { name: "Outras receitas", direction: FinancialDirection.INCOME },
  { name: "Comissões", direction: FinancialDirection.EXPENSE },
  { name: "Folha / salários", direction: FinancialDirection.EXPENSE },
  { name: "Aluguel", direction: FinancialDirection.EXPENSE },
  { name: "Fornecedores / produtos", direction: FinancialDirection.EXPENSE },
  { name: "Impostos e taxas", direction: FinancialDirection.EXPENSE },
  { name: "Outras despesas", direction: FinancialDirection.EXPENSE },
];

const TICKET_INCOME_CATEGORY = "Vendas de serviços";
const COMMISSION_CATEGORY = "Comissões";

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // Categorias
  // ─────────────────────────────────────────────

  async listCategories(tenantId: string) {
    const existing = await this.prisma.financialCategory.findMany({
      where: { tenantId },
      orderBy: [{ direction: "asc" }, { name: "asc" }],
    });
    if (existing.length > 0) return existing;

    await this.prisma.financialCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, tenantId })),
      skipDuplicates: true,
    });
    return this.prisma.financialCategory.findMany({
      where: { tenantId },
      orderBy: [{ direction: "asc" }, { name: "asc" }],
    });
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.getCategoryOrThrow(tenantId, dto.parentId);
    }
    return this.prisma.financialCategory.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        direction: dto.direction as FinancialDirection,
        parentId: dto.parentId ?? null,
      },
    });
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryDto) {
    await this.getCategoryOrThrow(tenantId, id);
    return this.prisma.financialCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
    });
  }

  // ─────────────────────────────────────────────
  // Lançamentos
  // ─────────────────────────────────────────────

  async listEntries(
    tenantId: string,
    filters: { from?: string; to?: string; direction?: string; status?: string; basis?: string },
  ) {
    const where: Prisma.FinancialEntryWhereInput = { tenantId };
    if (filters.direction === "INCOME" || filters.direction === "EXPENSE") {
      where.direction = filters.direction;
    }
    if (["PENDING", "PAID", "CANCELED"].includes(filters.status ?? "")) {
      where.status = filters.status as FinancialEntryStatus;
    }
    const field = filters.basis === "paid" ? "paidAt" : "dueDate";
    if (filters.from || filters.to) {
      const fromDate = filters.from ? new Date(filters.from) : undefined;
      const toDate = filters.to ? new Date(filters.to) : undefined;
      if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
        throw new BadRequestException("Intervalo de datas inválido.");
      }
      where[field] = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }
    return this.prisma.financialEntry.findMany({
      where,
      include: { category: { select: { name: true } } },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
  }

  async createEntry(tenantId: string, userId: string, dto: CreateEntryDto) {
    if (dto.categoryId) {
      const category = await this.getCategoryOrThrow(tenantId, dto.categoryId);
      if (category.direction !== dto.direction) {
        throw new BadRequestException("Categoria não corresponde ao tipo do lançamento.");
      }
    }
    return this.prisma.financialEntry.create({
      data: {
        tenantId,
        direction: dto.direction as FinancialDirection,
        description: dto.description.trim(),
        amountCents: dto.amountCents,
        dueDate: new Date(dto.dueDate),
        categoryId: dto.categoryId ?? null,
        counterparty: dto.counterparty?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdByUserId: userId,
        status: dto.paidAt ? FinancialEntryStatus.PAID : FinancialEntryStatus.PENDING,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
        paymentMethod: (dto.paymentMethod as PaymentMethod) ?? null,
      },
    });
  }

  async updateEntry(tenantId: string, id: string, dto: UpdateEntryDto) {
    const entry = await this.getEntryOrThrow(tenantId, id);
    if (entry.source !== FinancialEntrySource.MANUAL) {
      throw new BadRequestException("Lançamento gerado pelo sistema não pode ser editado.");
    }
    // categoryId vem do body: sem checar o tenant, dava pra apontar o lançamento pra categoria
    // de OUTRO negócio e ler o nome dela de volta em listEntries (include category.name).
    if (dto.categoryId) {
      const category = await this.getCategoryOrThrow(tenantId, dto.categoryId);
      if (category.direction !== entry.direction) {
        throw new BadRequestException("Categoria não corresponde ao tipo do lançamento.");
      }
    }
    return this.prisma.financialEntry.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
        ...(dto.counterparty !== undefined
          ? { counterparty: dto.counterparty?.trim() || null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
  }

  async settleEntry(tenantId: string, id: string, dto: SettleEntryDto) {
    const entry = await this.getEntryOrThrow(tenantId, id);
    if (entry.status === FinancialEntryStatus.PAID) {
      throw new BadRequestException("Lançamento já está quitado.");
    }
    if (entry.status === FinancialEntryStatus.CANCELED) {
      throw new BadRequestException("Lançamento cancelado não pode ser quitado.");
    }
    return this.prisma.financialEntry.update({
      where: { id },
      data: {
        status: FinancialEntryStatus.PAID,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        paymentMethod: (dto.paymentMethod as PaymentMethod) ?? entry.paymentMethod,
      },
    });
  }

  async cancelEntry(tenantId: string, id: string) {
    const entry = await this.getEntryOrThrow(tenantId, id);
    if (entry.source === FinancialEntrySource.TICKET) {
      throw new BadRequestException(
        "Receita de comanda não é cancelada aqui — cancele/estorne a comanda.",
      );
    }
    return this.prisma.financialEntry.update({
      where: { id },
      data: { status: FinancialEntryStatus.CANCELED },
    });
  }

  // ─────────────────────────────────────────────
  // Ganchos do PDV / comissão
  // ─────────────────────────────────────────────

  // Chamado dentro da transação de fechamento da comanda.
  async recordTicketIncome(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    ticket: { id: string; totalCents: number },
  ) {
    const category = await tx.financialCategory.findFirst({
      where: { tenantId, name: TICKET_INCOME_CATEGORY, direction: FinancialDirection.INCOME },
      select: { id: true },
    });
    await tx.financialEntry.create({
      data: {
        tenantId,
        direction: FinancialDirection.INCOME,
        source: FinancialEntrySource.TICKET,
        status: FinancialEntryStatus.PAID,
        description: "Venda (comanda)",
        amountCents: ticket.totalCents,
        categoryId: category?.id ?? null,
        ticketId: ticket.id,
        dueDate: new Date(),
        paidAt: new Date(),
        createdByUserId: userId,
      },
    });
  }

  // Registra um repasse pago a um profissional. Substitui o antigo "fechar comissões do período"
  // (não idempotente: clicar duas vezes duplicava a despesa e nada marcava a comissão como
  // fechada). Aqui o saldo é DERIVADO — comissões do histórico menos repasses já pagos — e o
  // servidor o recalcula DENTRO da transação, com lock por profissional, então dois cliques
  // simultâneos nunca pagam mais do que o saldo.
  async registerCommissionPayout(tenantId: string, userId: string, dto: RegisterPayoutDto) {
    const day = resolvePayoutDay(dto.paidOn);
    return this.prisma.$transaction(async (tx) => {
      const professional = await tx.professional.findFirst({
        where: { id: dto.professionalId, tenantId },
        select: { id: true, user: { select: { name: true } } },
      });
      if (!professional) throw new NotFoundException("Profissional não encontrado.");

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commission-payout:${professional.id}`})::bigint)`;

      // Reenvio da MESMA requisição (duplo clique, retry de rede): devolve o repasse já feito. A busca
      // vem depois do lock, então duas requisições simultâneas com a mesma chave se serializam.
      if (dto.requestKey) {
        const replay = await tx.commissionPayout.findFirst({
          where: { tenantId, requestKey: dto.requestKey },
        });
        if (replay) {
          if (replay.professionalId !== professional.id || replay.amountCents !== dto.amountCents) {
            throw new ConflictException("Esta requisição já foi usada com outros dados. Abra o repasse de novo.");
          }
          const [accruedNow, paidNow] = await Promise.all([
            tx.commissionEntry.aggregate({ where: { tenantId, professionalId: professional.id }, _sum: { amountCents: true } }),
            tx.commissionPayout.aggregate({ where: { tenantId, professionalId: professional.id }, _sum: { amountCents: true } }),
          ]);
          return {
            id: replay.id,
            amountCents: replay.amountCents,
            balanceAfterCents: (accruedNow._sum.amountCents ?? 0) - (paidNow._sum.amountCents ?? 0),
            paidOn: day.paidOn,
            replayed: true,
          };
        }
      }

      const [accrued, paid] = await Promise.all([
        tx.commissionEntry.aggregate({
          where: { tenantId, professionalId: professional.id },
          _sum: { amountCents: true },
        }),
        tx.commissionPayout.aggregate({
          where: { tenantId, professionalId: professional.id },
          _sum: { amountCents: true },
        }),
      ]);
      const balanceCents = (accrued._sum.amountCents ?? 0) - (paid._sum.amountCents ?? 0);
      if (dto.amountCents > balanceCents) {
        throw new BadRequestException(
          balanceCents > 0
            ? `O repasse não pode ser maior que o saldo a repassar (${formatBrl(balanceCents)}).`
            : "Este profissional não tem saldo a repassar.",
        );
      }

      const category = await tx.financialCategory.findFirst({
        where: { tenantId, name: COMMISSION_CATEGORY, direction: FinancialDirection.EXPENSE },
        select: { id: true },
      });
      const entry = await tx.financialEntry.create({
        data: {
          tenantId,
          direction: FinancialDirection.EXPENSE,
          status: FinancialEntryStatus.PAID,
          source: FinancialEntrySource.COMMISSION,
          description: `Repasse ${professional.user.name}`,
          amountCents: dto.amountCents,
          categoryId: category?.id ?? null,
          counterparty: professional.user.name,
          dueDate: day.dueDate,
          paidAt: day.paidAt,
          notes: dto.note ?? null,
          createdByUserId: userId,
        },
      });
      const payout = await tx.commissionPayout.create({
        data: {
          tenantId,
          professionalId: professional.id,
          amountCents: dto.amountCents,
          note: dto.note ?? null,
          financialEntryId: entry.id,
          requestKey: dto.requestKey ?? null,
          createdByUserId: userId,
        },
      });
      return {
        id: payout.id,
        amountCents: payout.amountCents,
        balanceAfterCents: balanceCents - dto.amountCents,
        paidOn: day.paidOn,
        replayed: false,
      };
    });
  }

  async listCommissionPayouts(tenantId: string, query: PayoutsQueryDto) {
    const pagination = resolvePagination(query);
    const where = {
      tenantId,
      ...(query.professionalId ? { professionalId: query.professionalId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.commissionPayout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: { professional: { select: { user: { select: { name: true } } } } },
      }),
      this.prisma.commissionPayout.count({ where }),
    ]);
    const items: CommissionPayout[] = rows.map((r) => ({
      id: r.id,
      professionalId: r.professionalId,
      professionalName: r.professional.user.name,
      amountCents: r.amountCents,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
    return toPage(items, total, pagination);
  }

  // ─────────────────────────────────────────────
  // Relatórios
  // ─────────────────────────────────────────────

  async cashFlow(tenantId: string, from: string, to: string, basis: "due" | "paid" = "paid") {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    this.assertRange(fromDate, toDate);

    const field = basis === "paid" ? "paidAt" : "dueDate";
    const where: Prisma.FinancialEntryWhereInput = {
      tenantId,
      status: basis === "paid" ? FinancialEntryStatus.PAID : { not: FinancialEntryStatus.CANCELED },
      [field]: { gte: fromDate, lte: toDate },
    };
    const entries = await this.prisma.financialEntry.findMany({
      where,
      include: { category: { select: { name: true } } },
      take: 5000,
    });

    let incomeCents = 0;
    let expenseCents = 0;
    const byCategory = new Map<string, { name: string; direction: string; totalCents: number }>();
    for (const entry of entries) {
      if (entry.direction === FinancialDirection.INCOME) incomeCents += entry.amountCents;
      else expenseCents += entry.amountCents;
      const key = `${entry.direction}:${entry.category?.name ?? "Sem categoria"}`;
      const current = byCategory.get(key) ?? {
        name: entry.category?.name ?? "Sem categoria",
        direction: entry.direction,
        totalCents: 0,
      };
      current.totalCents += entry.amountCents;
      byCategory.set(key, current);
    }

    return {
      basis,
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
      byCategory: [...byCategory.values()].sort((a, b) => b.totalCents - a.totalCents),
    };
  }

  async dre(tenantId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    this.assertRange(fromDate, toDate);

    const [entries, soldProducts] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where: {
          tenantId,
          status: FinancialEntryStatus.PAID,
          paidAt: { gte: fromDate, lte: toDate },
        },
        include: { category: { select: { name: true } } },
        take: 5000,
      }),
      // CMV aproximado: custo dos produtos com baixa SALE no período.
      this.prisma.stockMovement.findMany({
        where: { tenantId, kind: "SALE", createdAt: { gte: fromDate, lte: toDate } },
        include: { product: { select: { costCents: true } } },
        take: 5000,
      }),
    ]);

    const revenueCents = entries
      .filter((e) => e.direction === FinancialDirection.INCOME)
      .reduce((s, e) => s + e.amountCents, 0);

    const cogsCents = soldProducts.reduce(
      (s, m) => s + Math.abs(m.quantity) * (m.product.costCents ?? 0),
      0,
    );

    const expensesByCategory = new Map<string, number>();
    let expensesCents = 0;
    for (const entry of entries) {
      if (entry.direction !== FinancialDirection.EXPENSE) continue;
      expensesCents += entry.amountCents;
      const name = entry.category?.name ?? "Sem categoria";
      expensesByCategory.set(name, (expensesByCategory.get(name) ?? 0) + entry.amountCents);
    }

    return {
      revenueCents,
      cogsCents,
      grossProfitCents: revenueCents - cogsCents,
      expensesCents,
      expensesByCategory: [...expensesByCategory.entries()]
        .map(([name, totalCents]) => ({ name, totalCents }))
        .sort((a, b) => b.totalCents - a.totalCents),
      resultCents: revenueCents - cogsCents - expensesCents,
    };
  }

  async openItems(tenantId: string, direction: "INCOME" | "EXPENSE") {
    const now = new Date();
    const entries = await this.prisma.financialEntry.findMany({
      where: { tenantId, direction, status: FinancialEntryStatus.PENDING },
      include: { category: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    });
    return {
      totalCents: entries.reduce((s, e) => s + e.amountCents, 0),
      overdueCents: entries
        .filter((e) => e.dueDate < now)
        .reduce((s, e) => s + e.amountCents, 0),
      entries: entries.map((e) => ({
        id: e.id,
        description: e.description,
        counterparty: e.counterparty,
        categoryName: e.category?.name ?? null,
        amountCents: e.amountCents,
        dueDate: e.dueDate,
        overdueDays:
          e.dueDate < now
            ? Math.floor((now.getTime() - e.dueDate.getTime()) / 86_400_000)
            : 0,
      })),
    };
  }

  async overview(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const [receivable, payable, month] = await Promise.all([
      this.openItems(tenantId, "INCOME"),
      this.openItems(tenantId, "EXPENSE"),
      this.cashFlow(tenantId, monthStart.toISOString(), monthEnd.toISOString(), "paid"),
    ]);
    return {
      receivableCents: receivable.totalCents,
      receivableOverdueCents: receivable.overdueCents,
      payableCents: payable.totalCents,
      payableOverdueCents: payable.overdueCents,
      monthIncomeCents: month.incomeCents,
      monthExpenseCents: month.expenseCents,
      monthNetCents: month.netCents,
    };
  }

  // ─────────────────────────────────────────────

  private assertRange(from: Date, to: Date) {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException("Intervalo inválido.");
    }
    // Sem teto de amplitude, from/to vêm direto de @Query sem DTO — um intervalo tipo
    // 1970..2100 força materializar o ledger inteiro do tenant a cada chamada. 2 anos cobre
    // qualquer relatório anual/trimestral legítimo.
    const MAX_RANGE_DAYS = 731;
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`Intervalo máximo do relatório é de ${MAX_RANGE_DAYS} dias.`);
    }
  }

  private async getCategoryOrThrow(tenantId: string, id: string) {
    const category = await this.prisma.financialCategory.findFirst({ where: { id, tenantId } });
    if (!category) throw new NotFoundException("Categoria não encontrada.");
    return category;
  }

  private async getEntryOrThrow(tenantId: string, id: string) {
    const entry = await this.prisma.financialEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException("Lançamento não encontrado.");
    return entry;
  }
}

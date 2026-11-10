import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { ClubMembershipStatus, Prisma } from "@marquo/database";
import type { ClubMemberSummary, ClubMembershipState, ClubPlanSummary, Paginated } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { ClubAccessService, CLUB_PLAN_REQUIRED_MESSAGE } from "./club-access.service";
import { computeCoverage, NO_COVERAGE, type Coverage, type CoverageItem } from "./club-coverage";
import {
  ClubMemberStateFilter,
  CreateClubPlanDto,
  EnrollClubMemberDto,
  FindClubMembersQueryDto,
  UpdateClubPlanDto,
} from "./dto/club.dto";

type Db = PrismaService | Prisma.TransactionClient;

const TIMEZONE = "America/Sao_Paulo";
const MAX_PLANS_PER_TENANT = 30;
// Renovar só perto do fim do mês pago (ou depois dele): renovar no meio do mês descartaria os usos que sobraram.
const RENEW_WINDOW_DAYS = 7;
const RENEW_WINDOW_MS = RENEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function canRenewAt(periodEnd: Date, now: Date): boolean {
  return now.getTime() >= periodEnd.getTime() - RENEW_WINDOW_MS;
}

export interface TicketCoverage extends Coverage {
  membership: { id: string; periodStart: Date } | null;
}

const NO_TICKET_COVERAGE: TicketCoverage = { ...NO_COVERAGE, membership: null };

function addOneMonth(from: Date): Date {
  return DateTime.fromJSDate(from).setZone(TIMEZONE).plus({ months: 1 }).toJSDate();
}

function stateOf(status: ClubMembershipStatus, periodEnd: Date, now: Date): ClubMembershipState {
  if (status === ClubMembershipStatus.CANCELED) return "CANCELED";
  return periodEnd.getTime() <= now.getTime() ? "EXPIRED" : "ACTIVE";
}

const formatBrl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MEMBER_INCLUDE = {
  client: { select: { id: true, name: true, phone: true } },
  plan: { select: { name: true } },
} satisfies Prisma.ClubMembershipInclude;

type MemberRow = Prisma.ClubMembershipGetPayload<{ include: typeof MEMBER_INCLUDE }>;

@Injectable()
export class ClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly finance: FinanceService,
  ) {}

  // ───────── Ligar / desligar ─────────

  async overview(tenantId: string) {
    return this.access.overview(tenantId);
  }

  isActive(tenantId: string): Promise<boolean> {
    return this.access.isActive(tenantId);
  }

  // Desligar sempre pode (não apaga nada). Ligar exige que o plano inclua o clube.
  async setEnabled(tenantId: string, enabled: boolean) {
    if (enabled && !(await this.access.planAllowsClub(tenantId))) {
      throw new ForbiddenException(CLUB_PLAN_REQUIRED_MESSAGE);
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { clubEnabled: enabled } });
    return this.access.overview(tenantId);
  }

  // ───────── Pacotes ─────────

  async listPlans(tenantId: string): Promise<ClubPlanSummary[]> {
    const plans = await this.prisma.clubPlan.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: {
        services: { include: { service: { select: { id: true, name: true } } } },
        _count: { select: { memberships: { where: { status: ClubMembershipStatus.ACTIVE } } } },
      },
    });
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      usesPerMonth: plan.usesPerMonth,
      isActive: plan.isActive,
      services: plan.services.map((s) => s.service),
      activeMembers: plan._count.memberships,
    }));
  }

  async createPlan(tenantId: string, dto: CreateClubPlanDto): Promise<ClubPlanSummary> {
    await this.access.assertActive(tenantId);
    const serviceIds = [...new Set(dto.serviceIds)];

    const planId = await this.prisma.$transaction(async (tx) => {
      if ((await tx.clubPlan.count({ where: { tenantId } })) >= MAX_PLANS_PER_TENANT) {
        throw new ConflictException(`Limite de ${MAX_PLANS_PER_TENANT} pacotes atingido. Desative ou reaproveite um existente.`);
      }
      // Cada serviço precisa ser deste negócio e estar ativo (tenantId no WHERE): id de outro negócio dá o mesmo 404.
      const owned = await tx.service.findMany({ where: { id: { in: serviceIds }, tenantId, isActive: true }, select: { id: true } });
      if (owned.length !== serviceIds.length) {
        throw new NotFoundException("Serviço não encontrado.");
      }
      const plan = await tx.clubPlan.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description || null,
          priceCents: dto.priceCents,
          usesPerMonth: dto.usesPerMonth,
        },
        select: { id: true },
      });
      await tx.clubPlanService.createMany({ data: serviceIds.map((serviceId) => ({ clubPlanId: plan.id, serviceId })) });
      return plan.id;
    });

    return this.planSummary(tenantId, planId);
  }

  async updatePlan(tenantId: string, id: string, dto: UpdateClubPlanDto): Promise<ClubPlanSummary> {
    const data: Prisma.ClubPlanUpdateManyMutationInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    // tenantId no WHERE da ESCRITA: pacote de outro negócio é o mesmo 404 de um inexistente.
    const result = await this.prisma.clubPlan.updateMany({ where: { id, tenantId }, data });
    if (result.count === 0) throw new NotFoundException("Pacote não encontrado.");
    return this.planSummary(tenantId, id);
  }

  private async planSummary(tenantId: string, id: string): Promise<ClubPlanSummary> {
    const plan = (await this.listPlans(tenantId)).find((p) => p.id === id);
    if (!plan) throw new NotFoundException("Pacote não encontrado.");
    return plan;
  }

  // ───────── Membros ─────────

  async listMembers(tenantId: string, query: FindClubMembersQueryDto): Promise<Paginated<ClubMemberSummary>> {
    const pagination = resolvePagination(query);
    const now = new Date();
    const where: Prisma.ClubMembershipWhereInput = { tenantId };
    if (query.state === ClubMemberStateFilter.CANCELED) where.status = ClubMembershipStatus.CANCELED;
    else if (query.state === ClubMemberStateFilter.ACTIVE) Object.assign(where, { status: ClubMembershipStatus.ACTIVE, periodEnd: { gt: now } });
    else if (query.state === ClubMemberStateFilter.EXPIRED) Object.assign(where, { status: ClubMembershipStatus.ACTIVE, periodEnd: { lte: now } });

    const [rows, total] = await Promise.all([
      this.prisma.clubMembership.findMany({
        where,
        include: MEMBER_INCLUDE,
        orderBy: [{ periodEnd: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.clubMembership.count({ where }),
    ]);

    const usage = await this.usedUnits(this.prisma, rows);
    return toPage(rows.map((row) => this.toMemberSummary(row, usage.get(row.id) ?? 0, now)), total, pagination);
  }

  // Inscreve o cliente e registra o 1º mês como pago (o dinheiro entrou fora do sistema). Um cliente por vez com adesão ativa.
  async enroll(tenantId: string, userId: string, dto: EnrollClubMemberDto): Promise<ClubMemberSummary> {
    await this.access.assertActive(tenantId);
    const now = new Date();

    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`club-client:${tenantId}:${dto.clientId}`})::bigint)`;

      const client = await tx.client.findFirst({ where: { id: dto.clientId, tenantId }, select: { id: true, name: true } });
      if (!client) throw new NotFoundException("Cliente não encontrado.");
      const plan = await tx.clubPlan.findFirst({ where: { id: dto.planId, tenantId, isActive: true } });
      if (!plan) throw new NotFoundException("Pacote não encontrado ou desativado.");
      const existing = await tx.clubMembership.findFirst({
        where: { tenantId, clientId: client.id, status: ClubMembershipStatus.ACTIVE },
        select: { id: true },
      });
      if (existing) throw new ConflictException("Este cliente já está no clube. Renove ou cancele a adesão atual.");

      const membership = await tx.clubMembership.create({
        data: {
          tenantId,
          clubPlanId: plan.id,
          clientId: client.id,
          usesPerMonth: plan.usesPerMonth,
          priceCents: plan.priceCents,
          periodStart: now,
          periodEnd: addOneMonth(now),
        },
        select: { id: true },
      });
      await this.finance.recordClubIncome(tx, tenantId, userId, {
        amountCents: plan.priceCents,
        description: `Clube: ${plan.name} (${formatBrl(plan.priceCents)}) — ${client.name}`,
      });
      return membership.id;
    });

    return this.memberSummary(tenantId, id);
  }

  // Marca o próximo mês como pago: abre um mês novo A PARTIR DE AGORA (zera os usos) pelo preço ATUAL do pacote. Só perto do fim
  // do mês pago (ou depois): o lock + essa regra fazem um segundo clique não lançar a receita em dobro.
  async renew(tenantId: string, userId: string, id: string): Promise<ClubMemberSummary> {
    await this.access.assertActive(tenantId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`club-membership:${id}`})::bigint)`;

      const membership = await tx.clubMembership.findFirst({
        where: { id, tenantId, status: ClubMembershipStatus.ACTIVE },
        include: { plan: { select: { name: true, priceCents: true } }, client: { select: { name: true } } },
      });
      if (!membership) throw new NotFoundException("Adesão não encontrada.");

      if (!canRenewAt(membership.periodEnd, now)) {
        const renewFrom = DateTime.fromJSDate(membership.periodEnd).minus({ days: RENEW_WINDOW_DAYS });
        throw new ConflictException(
          `Este mês ainda está em andamento. Dá para renovar a partir de ${renewFrom.setZone(TIMEZONE).setLocale("pt-BR").toFormat("dd/MM")}.`,
        );
      }

      await tx.clubMembership.update({
        where: { id },
        data: { periodStart: now, periodEnd: addOneMonth(now), priceCents: membership.plan.priceCents },
      });
      await this.finance.recordClubIncome(tx, tenantId, userId, {
        amountCents: membership.plan.priceCents,
        description: `Clube: ${membership.plan.name} (${formatBrl(membership.plan.priceCents)}) — ${membership.client.name} (renovação)`,
      });
    });

    return this.memberSummary(tenantId, id);
  }

  // Cancela: os usos que sobraram se perdem. Não devolve dinheiro (isso é com o dono; cancele o lançamento no financeiro).
  async cancel(tenantId: string, id: string): Promise<ClubMemberSummary> {
    const result = await this.prisma.clubMembership.updateMany({
      where: { id, tenantId, status: ClubMembershipStatus.ACTIVE },
      data: { status: ClubMembershipStatus.CANCELED, canceledAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Adesão não encontrada.");
    return this.memberSummary(tenantId, id);
  }

  private async memberSummary(tenantId: string, id: string): Promise<ClubMemberSummary> {
    const row = await this.prisma.clubMembership.findFirst({ where: { id, tenantId }, include: MEMBER_INCLUDE });
    if (!row) throw new NotFoundException("Adesão não encontrada.");
    const usage = await this.usedUnits(this.prisma, [row]);
    return this.toMemberSummary(row, usage.get(row.id) ?? 0, new Date());
  }

  // Usos do MÊS PAGO ATUAL de cada adesão (periodStart do uso = periodStart da adesão): renovar zera sem apagar histórico.
  private async usedUnits(db: Db, rows: Array<{ id: string; periodStart: Date }>): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (rows.length === 0) return result;
    const groups = await db.clubUsage.groupBy({
      by: ["membershipId", "periodStart"],
      where: { membershipId: { in: rows.map((r) => r.id) } },
      _sum: { units: true },
    });
    for (const row of rows) {
      const group = groups.find((g) => g.membershipId === row.id && g.periodStart.getTime() === row.periodStart.getTime());
      result.set(row.id, group?._sum.units ?? 0);
    }
    return result;
  }

  private toMemberSummary(row: MemberRow, used: number, now: Date): ClubMemberSummary {
    return {
      id: row.id,
      state: stateOf(row.status, row.periodEnd, now),
      planName: row.plan.name,
      client: row.client,
      usesPerMonth: row.usesPerMonth,
      usesInPeriod: used,
      usesRemaining: Math.max(0, row.usesPerMonth - used),
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      priceCents: row.priceCents,
      canRenew: row.status === ClubMembershipStatus.ACTIVE && canRenewAt(row.periodEnd, now),
    };
  }

  // ───────── Comanda ─────────

  // Quais serviços da comanda o clube cobre AGORA. Só para cliente com adesão ATIVA e mês pago em vigor, com o clube ligado e o
  // plano permitindo. `lock`: ao FECHAR, serializa fechamentos do mesmo membro (advisory lock na adesão) para dois fechamentos
  // simultâneos nunca gastarem o mesmo uso.
  async coverageForTicket(
    db: Db,
    tenantId: string,
    ticket: { clientId: string | null; items: CoverageItem[] },
    options: { lock?: boolean; assumeActive?: boolean } = {},
  ): Promise<TicketCoverage> {
    if (!ticket.clientId || ticket.items.length === 0) return NO_TICKET_COVERAGE;
    // `assumeActive`: quem lista várias comandas confere o clube UMA vez e não repete a consulta por comanda.
    if (!options.assumeActive && !(await this.access.isActive(tenantId, db))) return NO_TICKET_COVERAGE;

    const now = new Date();
    const membership = await db.clubMembership.findFirst({
      where: { tenantId, clientId: ticket.clientId, status: ClubMembershipStatus.ACTIVE, periodStart: { lte: now }, periodEnd: { gt: now } },
      select: { id: true, periodStart: true, usesPerMonth: true, plan: { select: { services: { select: { serviceId: true } } } } },
    });
    if (!membership) return NO_TICKET_COVERAGE;

    if (options.lock) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`club-membership:${membership.id}`})::bigint)`;
    }
    const used = await db.clubUsage.aggregate({
      where: { membershipId: membership.id, periodStart: membership.periodStart },
      _sum: { units: true },
    });
    const remaining = membership.usesPerMonth - (used._sum.units ?? 0);
    const coverage = computeCoverage(ticket.items, new Set(membership.plan.services.map((s) => s.serviceId)), remaining);
    return { ...coverage, membership: { id: membership.id, periodStart: membership.periodStart } };
  }

  // Reabertura de comanda (mesma transação): devolve os usos que o fechamento baixou. Ao fechar de novo, a cobertura é recalculada.
  async releaseUsage(tx: Prisma.TransactionClient, tenantId: string, ticketId: string): Promise<{ count: number }> {
    return tx.clubUsage.deleteMany({ where: { tenantId, ticketId } });
  }

  // Grava a baixa dos usos (uma linha por item coberto) na transação do fechamento.
  async recordUsage(tx: Prisma.TransactionClient, tenantId: string, ticketId: string, coverage: TicketCoverage): Promise<void> {
    if (!coverage.membership || coverage.lines.length === 0) return;
    await tx.clubUsage.createMany({
      data: coverage.lines.map((line) => ({
        tenantId,
        membershipId: coverage.membership!.id,
        ticketId,
        ticketItemId: line.itemId,
        periodStart: coverage.membership!.periodStart,
        units: line.units,
        coveredCents: line.coveredCents,
      })),
    });
  }
}

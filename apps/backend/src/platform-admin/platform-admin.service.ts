import { randomBytes } from "crypto";
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { DateTime } from "luxon";
import { PlanTier, Prisma, Role, SubscriptionStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { computeBillingStatus } from "../billing/billing-status.util";
import { InternalService, PASSWORD_RESET_TTL_MS } from "../internal/internal.service";
import { TRIAL_DAYS } from "../billing/trial.constants";
import { isReservedSlug } from "../common/constants/reserved-slugs";
import { generateUniqueSlug } from "../common/utils/slug.util";
import { normalizePhone } from "../common/utils/phone.util";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";
import { EMAIL_TAKEN_MESSAGE } from "../signup/signup.service";
import {
  CreatePlatformTenantDto,
  ExtendTrialDto,
  GrantCourtesyDto,
  PlatformAuditQueryDto,
  PlatformSubscriptionsQueryDto,
  PlatformTenantsQueryDto,
  PlatformUsersQueryDto,
  SuspendTenantDto,
  UpdateOwnerPhoneDto,
} from "./dto/platform-admin.dto";

export const AUDIT = {
  CREATED: "TENANT_CREATED",
  SUSPENDED: "TENANT_SUSPENDED",
  REACTIVATED: "TENANT_REACTIVATED",
  TRIAL_EXTENDED: "TRIAL_EXTENDED",
  COURTESY_GRANTED: "COURTESY_GRANTED",
  COURTESY_REMOVED: "COURTESY_REMOVED",
  OWNER_PHONE_UPDATED: "OWNER_PHONE_UPDATED",
} as const;

// Estados em que o negócio paga (conta no MRR). PAST_DUE ainda está em período de graça.
const REVENUE_STATUSES = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];
const SIGNUP_SERIES_DAYS = 30;
const SIGNUP_SERIES_CAP = 5000;
const TRIAL_MAX_AHEAD_DAYS = 180;
const TZ = "America/Sao_Paulo";
const BCRYPT_ROUNDS = 12;
const MAX_SLUG_ATTEMPTS = 3;
const SET_PASSWORD_TOKEN_BYTES = 32;

function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === "string" && target.includes(field);
}

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────
  // Métricas
  // ─────────────────────────────────────────────

  async overview() {
    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * 86_400_000);
    const since30 = new Date(now.getTime() - SIGNUP_SERIES_DAYS * 86_400_000);
    const in7 = new Date(now.getTime() + 7 * 86_400_000);
    const active = { suspendedAt: null };
    const noSubscription = { subscription: { is: null } };

    const [
      total,
      suspended,
      trialing,
      trialExpired,
      statusCounts,
      revenueGroups,
      signups7,
      signups30,
      signupRows,
      trialsEndingSoon,
      userGroups,
      consumers,
      appointments30,
      listed,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.tenant.count({ where: { ...active, ...noSubscription, trialEndsAt: { gt: now } } }),
      this.prisma.tenant.count({ where: { ...active, ...noSubscription, trialEndsAt: { lte: now } } }),
      Promise.all(
        Object.values(SubscriptionStatus).map(async (status) => ({
          status,
          count: await this.prisma.tenant.count({ where: { ...active, subscription: { is: { status } } } }),
        })),
      ),
      this.prisma.subscription.groupBy({
        by: ["planId"],
        where: { status: { in: REVENUE_STATUSES }, tenant: { suspendedAt: null } },
        _count: { _all: true },
      }),
      this.prisma.tenant.count({ where: { createdAt: { gte: since7 } } }),
      this.prisma.tenant.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.tenant.findMany({
        where: { createdAt: { gte: since30 } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        take: SIGNUP_SERIES_CAP,
      }),
      this.prisma.tenant.count({
        where: { ...active, ...noSubscription, trialEndsAt: { gt: now, lte: in7 } },
      }),
      this.prisma.user.groupBy({ by: ["role"], where: { isActive: true }, _count: { _all: true } }),
      this.prisma.consumer.count(),
      this.prisma.appointment.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.tenant.count({ where: { listedInMarketplace: true, suspendedAt: null } }),
    ]);

    // Receita recorrente mensal estimada: soma do preço de tabela do plano das assinaturas que pagam.
    // É estimativa (não considera cupom/proração); o Stripe segue sendo a fonte do que foi cobrado.
    const plans = await this.prisma.plan.findMany({ select: { id: true, name: true, priceCents: true } });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const byPlan = revenueGroups.map((group) => {
      const plan = planById.get(group.planId);
      const count = group._count._all;
      return {
        planName: plan?.name ?? "Plano removido",
        subscribers: count,
        monthlyCents: (plan?.priceCents ?? 0) * count,
      };
    });

    return {
      generatedAt: now,
      tenants: {
        total,
        listedInMarketplace: listed,
        byStatus: [
          { status: "TRIALING", count: trialing },
          { status: "TRIAL_EXPIRED", count: trialExpired },
          ...statusCounts,
          { status: "SUSPENDED", count: suspended },
        ],
        trialsEndingIn7Days: trialsEndingSoon,
      },
      revenue: {
        mrrCents: byPlan.reduce((sum, row) => sum + row.monthlyCents, 0),
        payingTenants: byPlan.reduce((sum, row) => sum + row.subscribers, 0),
        byPlan,
      },
      signups: {
        last7Days: signups7,
        last30Days: signups30,
        series: this.signupSeries(signupRows.map((row) => row.createdAt), now),
      },
      users: {
        activeByRole: userGroups.map((group) => ({ role: group.role, count: group._count._all })),
        consumers,
      },
      activity: { appointmentsCreatedLast30Days: appointments30 },
    };
  }

  // Um ponto por dia (fuso de São Paulo), com zeros nos dias sem cadastro, para o gráfico não ter buraco.
  private signupSeries(dates: Date[], now: Date) {
    const counts = new Map<string, number>();
    for (const date of dates) {
      const key = DateTime.fromJSDate(date, { zone: TZ }).toISODate()!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const today = DateTime.fromJSDate(now, { zone: TZ }).startOf("day");
    return Array.from({ length: SIGNUP_SERIES_DAYS }, (_, index) => {
      const day = today.minus({ days: SIGNUP_SERIES_DAYS - 1 - index }).toISODate()!;
      return { date: day, count: counts.get(day) ?? 0 };
    });
  }

  // ─────────────────────────────────────────────
  // Negócios
  // ─────────────────────────────────────────────

  async listTenants(query: PlatformTenantsQueryDto) {
    const pagination = resolvePagination(query);
    const search = query.search?.trim();
    const and: Prisma.TenantWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { users: { some: { role: Role.OWNER, email: { contains: search.toLowerCase() } } } },
        ],
      });
    }
    if (query.status) and.push(this.statusWhere(query.status));
    const where: Prisma.TenantWhereInput = and.length > 0 ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          trialEndsAt: true,
          suspendedAt: true,
          listedInMarketplace: true,
          subscription: {
            select: {
              status: true,
              courtesy: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              plan: { select: { name: true } },
            },
          },
          users: { where: { role: Role.OWNER }, select: { name: true, email: true, phone: true }, take: 1 },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return toPage(
      rows.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
        ownerName: tenant.users[0]?.name ?? null,
        ownerEmail: tenant.users[0]?.email ?? null,
        ownerPhone: tenant.users[0]?.phone ?? null,
        billingStatus: computeBillingStatus(tenant, tenant.subscription),
        planName: tenant.subscription?.plan.name ?? null,
        courtesy: tenant.subscription?.courtesy ?? false,
        courtesyEndsAt: tenant.subscription?.courtesy ? tenant.subscription.currentPeriodEnd : null,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: tenant.subscription?.cancelAtPeriodEnd ?? false,
        suspendedAt: tenant.suspendedAt,
        listedInMarketplace: tenant.listedInMarketplace,
      })),
      total,
      pagination,
    );
  }

  private statusWhere(status: NonNullable<PlatformTenantsQueryDto["status"]>): Prisma.TenantWhereInput {
    const now = new Date();
    switch (status) {
      case "SUSPENDED":
        return { suspendedAt: { not: null } };
      case "TRIALING":
        return { suspendedAt: null, subscription: { is: null }, trialEndsAt: { gt: now } };
      case "TRIAL_EXPIRED":
        return { suspendedAt: null, subscription: { is: null }, trialEndsAt: { lte: now } };
      default:
        return { suspendedAt: null, subscription: { is: { status } } };
    }
  }

  // `select` explícito: nada de passwordHash, token ou segredo.
  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        trialEndsAt: true,
        suspendedAt: true,
        suspendedReason: true,
        description: true,
        city: true,
        neighborhood: true,
        address: true,
        listedInMarketplace: true,
        subscription: {
          select: {
            status: true,
            courtesy: true,
            method: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
            plan: { select: { name: true, tier: true, priceCents: true } },
          },
        },
        users: {
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
          take: 100,
        },
        _count: { select: { appointments: true, clients: true, professionals: true, services: true } },
        couponRedemptions: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { createdAt: true, coupon: { select: { code: true, kind: true, value: true } } },
        },
      },
    });
    if (!tenant) throw new NotFoundException("Negócio não encontrado.");

    const audit = await this.prisma.adminAuditLog.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, actor: true, detail: true, createdAt: true },
    });

    const { _count, couponRedemptions, ...rest } = tenant;
    return {
      ...rest,
      coupon: couponRedemptions[0]
        ? { ...couponRedemptions[0].coupon, redeemedAt: couponRedemptions[0].createdAt }
        : null,
      billingStatus: computeBillingStatus(tenant, tenant.subscription),
      counts: {
        appointments: _count.appointments,
        clients: _count.clients,
        professionals: _count.professionals,
        services: _count.services,
      },
      audit,
    };
  }

  // ─────────────────────────────────────────────
  // Usuários, assinaturas, auditoria
  // ─────────────────────────────────────────────

  async listUsers(query: PlatformUsersQueryDto) {
    const pagination = resolvePagination(query);
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search.toLowerCase() } },
              { tenant: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(rows, total, pagination);
  }

  async listSubscriptions(query: PlatformSubscriptionsQueryDto) {
    const pagination = resolvePagination(query);
    const where: Prisma.SubscriptionWhereInput = query.status ? { status: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          status: true,
          courtesy: true,
          method: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
          plan: { select: { name: true, priceCents: true } },
          tenant: { select: { id: true, name: true, slug: true, suspendedAt: true } },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return toPage(rows, total, pagination);
  }

  async listAudit(query: PlatformAuditQueryDto) {
    const pagination = resolvePagination(query);
    const where: Prisma.AdminAuditLogWhereInput = query.tenantId ? { tenantId: query.tenantId } : {};

    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: { id: true, action: true, actor: true, detail: true, tenantId: true, createdAt: true },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return toPage(rows, total, pagination);
  }

  // ─────────────────────────────────────────────
  // Ações (todas gravam auditoria na MESMA transação)
  // ─────────────────────────────────────────────

  async suspend(tenantId: string, dto: SuspendTenantDto, actor: string) {
    // updateMany com `suspendedAt: null` no WHERE: duas suspensões simultâneas não sobrescrevem o motivo
    // da primeira nem geram duas linhas de auditoria.
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: { id: tenantId, suspendedAt: null },
        data: { suspendedAt: new Date(), suspendedReason: dto.reason },
      });
      if (updated.count === 1) {
        await tx.adminAuditLog.create({
          data: { action: AUDIT.SUSPENDED, actor, tenantId, detail: dto.reason },
        });
      }
      return updated.count;
    });
    if (result === 0) await this.throwNotFoundOrConflict(tenantId, "Este negócio já está suspenso.");
    this.logger.log(`Negócio ${tenantId} suspenso por ${actor}.`);
    return this.getTenant(tenantId);
  }

  async reactivate(tenantId: string, actor: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: { id: tenantId, suspendedAt: { not: null } },
        data: { suspendedAt: null, suspendedReason: null },
      });
      if (updated.count === 1) {
        await tx.adminAuditLog.create({ data: { action: AUDIT.REACTIVATED, actor, tenantId } });
      }
      return updated.count;
    });
    if (result === 0) await this.throwNotFoundOrConflict(tenantId, "Este negócio não está suspenso.");
    this.logger.log(`Negócio ${tenantId} reativado por ${actor}.`);
    return this.getTenant(tenantId);
  }

  async extendTrial(tenantId: string, dto: ExtendTrialDto, actor: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { trialEndsAt: true, subscription: { select: { id: true } } },
    });
    if (!tenant) throw new NotFoundException("Negócio não encontrado.");
    if (tenant.subscription) {
      throw new ConflictException("Este negócio já tem assinatura: não há período de teste para estender.");
    }

    // Soma a partir do que for maior entre agora e o fim atual: estender um trial vencido não "paga"
    // os dias que já passaram.
    const base = Math.max(Date.now(), tenant.trialEndsAt.getTime());
    const next = new Date(base + dto.days * 86_400_000);
    if (next.getTime() > Date.now() + TRIAL_MAX_AHEAD_DAYS * 86_400_000) {
      throw new BadRequestException(`O período de teste não pode passar de ${TRIAL_MAX_AHEAD_DAYS} dias a partir de hoje.`);
    }

    // trialEndsAt no WHERE: se outra extensão rodou entre a leitura e a escrita, esta falha em vez de
    // sobrescrever (e a auditoria não fica com um valor que não aconteceu).
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: { id: tenantId, trialEndsAt: tenant.trialEndsAt, subscription: { is: null } },
        data: { trialEndsAt: next },
      });
      if (updated.count === 1) {
        await tx.adminAuditLog.create({
          data: { action: AUDIT.TRIAL_EXTENDED, actor, tenantId, detail: `+${dto.days} dias (até ${next.toISOString()})` },
        });
      }
      return updated.count;
    });
    if (result === 0) throw new ConflictException("O período de teste mudou enquanto você estendia. Tente de novo.");
    this.logger.log(`Trial do negócio ${tenantId} estendido em ${dto.days} dias por ${actor}.`);
    return this.getTenant(tenantId);
  }

  // Cadastra um negócio (Tenant + dono OWNER em trial, sem assinatura) a pedido da plataforma. O admin NÃO
  // escolhe a senha do dono: a conta nasce com uma senha aleatória que ninguém conhece e já vem com um
  // link de "definir senha" (uso único, 24 h, só o hash vai ao banco). Tudo, inclusive a auditoria, numa
  // única transação: não existe negócio criado sem trilha, nem link sem negócio.
  async createTenant(dto: CreatePlatformTenantDto, actor: string) {
    const unusablePasswordHash = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
    const token = randomBytes(SET_PASSWORD_TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

    for (let attempt = 1; ; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const slug = await generateUniqueSlug(dto.businessName, async (candidate) => {
            if (isReservedSlug(candidate)) return true;
            const existing = await tx.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
            return existing !== null;
          });

          const tenant = await tx.tenant.create({
            data: { name: dto.businessName, slug, trialEndsAt },
            select: { id: true, name: true, slug: true },
          });
          const owner = await tx.user.create({
            data: {
              tenantId: tenant.id,
              email: dto.ownerEmail,
              name: dto.ownerName,
              phone: normalizePhone(dto.ownerPhone),
              role: Role.OWNER,
              passwordHash: unusablePasswordHash,
              passwordSetTokenHash: hashPasswordSetToken(token),
              passwordSetTokenExpiresAt: expiresAt,
            },
            select: { id: true },
          });
          await tx.adminAuditLog.create({
            data: {
              action: AUDIT.CREATED,
              actor,
              tenantId: tenant.id,
              targetUserId: owner.id,
              detail: `Negócio "${tenant.name}" criado para ${dto.ownerEmail}`,
            },
          });
          return tenant;
        });

        this.logger.log(`Negócio ${created.id} criado por ${actor}.`);
        const base = (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
        return {
          tenant: created,
          ownerEmail: dto.ownerEmail,
          // Em claro só aqui, uma vez: quem criou entrega ao dono por outro canal.
          link: `${base}/definir-senha?token=${token}`,
          expiresAt,
        };
      } catch (error) {
        // Unicidade decidida pelo banco (sem "checar antes, inserir depois").
        if (isUniqueViolation(error, "email")) throw new ConflictException(EMAIL_TAKEN_MESSAGE);
        if (isUniqueViolation(error, "slug") && attempt < MAX_SLUG_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  // ─────────────────────────────────────────────
  // Plano de cortesia (sem cobrança) e telefone do dono
  // ─────────────────────────────────────────────

  // Libera um plano sem cobrar (parceria, teste, compensação). Vive em Subscription com courtesy = true e
  // termina em currentPeriodEnd (nulo = sem data de fim). Não substitui assinatura PAGA: com assinatura de
  // um provedor de pagamento, o plano muda pelo provedor, não por aqui.
  async grantCourtesy(tenantId: string, dto: GrantCourtesyDto, actor: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, subscription: { select: { courtesy: true } } },
    });
    if (!tenant) throw new NotFoundException("Negócio não encontrado.");
    if (tenant.subscription && !tenant.subscription.courtesy) {
      throw new ConflictException(
        "Este negócio tem uma assinatura paga: o plano dela não pode ser trocado por cortesia.",
      );
    }

    const plan = await this.prisma.plan.findUnique({ where: { tier: dto.tier } });
    if (!plan) throw new NotFoundException("Plano não encontrado.");

    // O novo plano precisa comportar a equipe que o negócio já tem ativa; senão o negócio ficaria acima do
    // limite sem ninguém ter escolhido quem desativar.
    if (plan.maxProfessionals !== null) {
      const active = await this.prisma.professional.count({ where: { tenantId, isActive: true } });
      if (active > plan.maxProfessionals) {
        throw new ConflictException(
          `Este negócio tem ${active} profissionais ativos e o plano ${plan.name} permite ${plan.maxProfessionals}. O dono precisa desativar o excedente antes.`,
        );
      }
    }

    const endsAt = dto.days ? new Date(Date.now() + dto.days * 86_400_000) : null;
    const values = {
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      courtesy: true,
      currentPeriodEnd: endsAt,
      cancelAtPeriodEnd: false,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { tenantId },
        create: { tenantId, ...values },
        update: values,
      });
      await tx.adminAuditLog.create({
        data: {
          action: AUDIT.COURTESY_GRANTED,
          actor,
          tenantId,
          detail: `Plano ${plan.name} ${endsAt ? `até ${endsAt.toISOString()}` : "sem data de fim"}`,
        },
      });
    });
    this.logger.log(`Cortesia ${plan.tier} concedida ao negócio ${tenantId} por ${actor}.`);
    return this.getTenant(tenantId);
  }

  // Encerra a cortesia: o negócio volta ao estado do período de teste (em curso ou vencido).
  async removeCourtesy(tenantId: string, actor: string) {
    const removed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.subscription.deleteMany({ where: { tenantId, courtesy: true } });
      if (result.count === 1) {
        await tx.adminAuditLog.create({ data: { action: AUDIT.COURTESY_REMOVED, actor, tenantId } });
      }
      return result.count;
    });
    if (removed === 0) {
      await this.throwNotFoundOrConflict(tenantId, "Este negócio não tem uma cortesia para remover.");
    }
    return this.getTenant(tenantId);
  }

  // Corrige/preenche o telefone do dono (contas antigas não têm). O número NÃO vai para a auditoria
  // (dado pessoal): fica só o fato de que foi alterado e por quem.
  async updateOwnerPhone(tenantId: string, dto: UpdateOwnerPhoneDto, actor: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { tenantId, role: Role.OWNER, isActive: true },
        data: { phone: normalizePhone(dto.phone) },
      });
      if (result.count > 0) {
        await tx.adminAuditLog.create({
          data: { action: AUDIT.OWNER_PHONE_UPDATED, actor, tenantId, detail: "Telefone do dono atualizado" },
        });
      }
      return result.count;
    });
    if (updated === 0) throw new NotFoundException("Dono ativo não encontrado para este negócio.");
    return this.getTenant(tenantId);
  }

  createPasswordResetLink(tenantId: string, actor: string) {
    return this.internal.createPasswordResetLink(tenantId, actor);
  }

  private async throwNotFoundOrConflict(tenantId: string, conflictMessage: string): Promise<never> {
    const exists = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Negócio não encontrado.");
    throw new ConflictException(conflictMessage);
  }
}

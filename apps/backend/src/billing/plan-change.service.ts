import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PlanTier, SubscriptionStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { SLOT_BLOCKING_STATUSES } from "../appointments/appointments.service";
import { StripeService } from "./stripe.service";
import { failStripeCall } from "./stripe-errors";
import { ChangePlanDto } from "./dto/billing.dto";

export interface PlanChangePreview {
  currentTier: PlanTier;
  newTier: PlanTier;
  direction: "UPGRADE" | "DOWNGRADE";
  newLimit: number | null;
  activeCount: number;
  excess: number;
  // Só quando há excesso: os profissionais ativos, com quantos agendamentos futuros cada um tem
  // (quem tem agenda futura não pode ser desativado até o dono cancelar ou remarcar).
  professionals: {
    id: string;
    name: string;
    email: string;
    futureAppointments: number;
    canDeactivate: boolean;
  }[];
}

@Injectable()
export class PlanChangeService {
  private readonly logger = new Logger(PlanChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // Nada aqui altera dados: mostra ao dono o que a troca exige, para ele escolher quem desativar.
  async preview(tenantId: string, tier: PlanTier): Promise<PlanChangePreview> {
    const { subscription, target } = await this.loadContext(tenantId, tier);
    const professionals = await this.prisma.professional.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, user: { select: { name: true, email: true } } },
    });

    const excess = this.excessFor(target.maxProfessionals, professionals.length);
    const base = {
      currentTier: subscription.plan.tier,
      newTier: target.tier,
      direction: target.priceCents >= subscription.plan.priceCents ? ("UPGRADE" as const) : ("DOWNGRADE" as const),
      newLimit: target.maxProfessionals,
      activeCount: professionals.length,
      excess,
    };
    if (excess === 0) return { ...base, professionals: [] };

    const futureByProfessional = await this.futureAppointmentCounts(
      this.prisma,
      tenantId,
      professionals.map((p) => p.id),
    );
    return {
      ...base,
      professionals: professionals.map((p) => {
        const futureAppointments = futureByProfessional.get(p.id) ?? 0;
        return {
          id: p.id,
          name: p.user.name,
          email: p.user.email,
          futureAppointments,
          canDeactivate: futureAppointments === 0,
        };
      }),
    };
  }

  // Troca o plano valendo NA HORA (crédito proporcional no Stripe). O dono escolhe quem desativar
  // quando o plano novo tem menos vagas. Tudo roda numa transação com lock por tenant: as
  // desativações e a mudança no Stripe são um bloco só — se o Stripe falhar, nada foi desativado.
  async change(tenantId: string, dto: ChangePlanDto): Promise<{ tier: PlanTier; deactivated: number }> {
    const { subscription, target } = await this.loadContext(tenantId, dto.tier);
    const chosenIds = dto.deactivateProfessionalIds ?? [];
    const stripeSubscriptionId = subscription.stripeSubscriptionId;
    if (!stripeSubscriptionId) {
      throw new ConflictException("Sua assinatura ainda não foi confirmada pelo serviço de pagamento.");
    }
    const newPriceId = this.stripe.priceIdForTier(dto.tier);
    // A troca cobra o Price novo na hora (crédito proporcional): mesma conferência do checkout.
    await this.stripe.assertPriceMatchesCatalog(dto.tier);

    // O item da assinatura (a ser trocado de Price) vem do Stripe; conferimos que a assinatura é
    // mesmo deste tenant e deste produto antes de mexer nela.
    let itemId: string;
    let currentPriceId: string;
    try {
      const stripeSubscription = await this.stripe.sdk.subscriptions.retrieve(stripeSubscriptionId);
      const item = stripeSubscription.items.data[0];
      if (
        !item ||
        stripeSubscription.metadata?.tenantId !== tenantId ||
        stripeSubscription.metadata?.product !== "totalagenda"
      ) {
        throw new ConflictException("Não foi possível trocar o plano desta assinatura. Fale com o suporte.");
      }
      itemId = item.id;
      currentPriceId = item.price.id;
    } catch (error) {
      return failStripeCall(this.logger, "ler a assinatura", error);
    }

    const deactivated = await this.prisma.$transaction(
      async (tx) => {
        // Serializa trocas simultâneas do mesmo tenant (duplo clique) e a contagem que vem a seguir.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-change:${tenantId}`})::bigint)`;

        const active = await tx.professional.findMany({
          where: { tenantId, isActive: true },
          select: { id: true },
        });
        const excess = this.excessFor(target.maxProfessionals, active.length);
        if (chosenIds.length !== excess) {
          throw new BadRequestException(
            excess > 0
              ? `Escolha exatamente ${excess} profissional(is) para desativar antes de trocar para o plano ${target.name}.`
              : `O plano ${target.name} não exige desativar profissionais.`,
          );
        }

        if (excess > 0) {
          // Só profissionais ATIVOS deste tenant; qualquer outro id responde igual a "não existe".
          const chosen = await tx.professional.findMany({
            where: { id: { in: chosenIds }, tenantId, isActive: true },
            select: { id: true, user: { select: { name: true } } },
          });
          if (chosen.length !== chosenIds.length) throw new NotFoundException("Profissional não encontrado.");

          // Mesma regra de PATCH /professionals/:id (isActive=false): agenda futura precisa ser
          // resolvida antes, senão o agendamento some do calendário mas continua ocupando o horário.
          const future = await this.futureAppointmentCounts(tx, tenantId, chosenIds);
          const blocked = chosen.find((p) => (future.get(p.id) ?? 0) > 0);
          if (blocked) {
            throw new ConflictException(
              `Não é possível desativar ${blocked.user.name}: há ${future.get(blocked.id)} agendamento(s) futuro(s). Cancele ou remarque antes de trocar de plano.`,
            );
          }
          await tx.professional.updateMany({ where: { id: { in: chosenIds }, tenantId }, data: { isActive: false } });
        }

        await tx.subscription.update({ where: { tenantId }, data: { planId: target.id } });

        // Stripe por ÚLTIMO: se falhar, a transação inteira é revertida. A chave de idempotência
        // (com janela de 1 min) absorve o duplo clique sem impedir uma troca legítima depois.
        try {
          await this.stripe.sdk.subscriptions.update(
            stripeSubscriptionId,
            {
              items: [{ id: itemId, price: newPriceId }],
              proration_behavior: "create_prorations",
            },
            { idempotencyKey: `plan-change-${stripeSubscriptionId}-${currentPriceId}-${newPriceId}-${Math.floor(Date.now() / 60_000)}` },
          );
        } catch (error) {
          return failStripeCall(this.logger, "trocar o plano da assinatura", error);
        }
        return chosenIds.length;
      },
      { timeout: 20_000, maxWait: 5_000 },
    );

    return { tier: dto.tier, deactivated };
  }

  // Só assinatura ATIVA troca de plano: em atraso o Stripe tentaria cobrar uma fatura já vencida,
  // e sem assinatura o caminho é o checkout.
  private async loadContext(tenantId: string, tier: PlanTier) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new ConflictException("Para trocar de plano é preciso ter uma assinatura. Assine um plano primeiro.");
    }
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new ConflictException("Regularize o pagamento da assinatura antes de trocar de plano.");
    }
    const target = await this.prisma.plan.findUnique({ where: { tier } });
    if (!target) throw new NotFoundException("Plano não encontrado.");
    if (subscription.plan.tier === tier) throw new ConflictException("Você já está neste plano.");
    return { subscription, target };
  }

  private excessFor(limit: number | null, activeCount: number): number {
    return limit === null ? 0 : Math.max(0, activeCount - limit);
  }

  private async futureAppointmentCounts(
    db: Pick<PrismaService, "appointment">,
    tenantId: string,
    professionalIds: string[],
  ): Promise<Map<string, number>> {
    if (professionalIds.length === 0) return new Map();
    const rows = await db.appointment.groupBy({
      by: ["professionalId"],
      where: {
        tenantId,
        professionalId: { in: professionalIds },
        status: { in: SLOT_BLOCKING_STATUSES },
        startAt: { gt: new Date() },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.professionalId, row._count._all]));
  }
}

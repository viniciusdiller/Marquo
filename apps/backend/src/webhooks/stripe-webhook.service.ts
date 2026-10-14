import { Injectable, Logger } from "@nestjs/common";
import { Prisma, SubscriptionStatus } from "@marquo/database";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { StripeService } from "../billing/stripe.service";

const HANDLED_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: SubscriptionStatus.ACTIVE,
  trialing: SubscriptionStatus.ACTIVE, // o checkout não usa trial do Stripe; se vier, tem acesso
  past_due: SubscriptionStatus.PAST_DUE, // período de graça durante os retries de cobrança
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.UNPAID, // não usamos pausa; se vier, bloqueia e manda regularizar
  canceled: SubscriptionStatus.CANCELED,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.CANCELED,
};

// Assinaturas que já terminaram: um evento atrasado de uma assinatura ANTIGA não pode derrubar a
// atual (o dono cancelou, assinou de novo, e o "deleted" da primeira chega depois).
const ENDED: ReadonlySet<Stripe.Subscription.Status> = new Set(["canceled", "incomplete_expired"]);

const idOf = (ref: string | { id: string } | null | undefined): string | null =>
  typeof ref === "string" ? ref : (ref?.id ?? null);

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // O evento só diz "algo mudou nesta assinatura". O estado de verdade é RELIDO na API do Stripe a
  // cada evento e gravado: por isso eventos fora de ordem, repetidos ou atrasados convergem para o
  // mesmo resultado, sem precisar comparar timestamps. Uma falha (API do Stripe fora, banco) lança
  // e devolve 500: o Stripe reentrega, e o evento só é marcado como processado DEPOIS de dar certo.
  async handle(event: Stripe.Event): Promise<void> {
    if (!HANDLED_EVENTS.has(event.type)) return;

    const already = await this.prisma.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } });
    if (already) return;

    const refs = this.extractRefs(event);
    if (refs) await this.syncSubscription(refs.customerId, refs.subscriptionId);

    await this.markProcessed(event);
  }

  private extractRefs(event: Stripe.Event): { customerId: string; subscriptionId: string } | null {
    let customer: string | null = null;
    let subscription: string | null = null;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") return null;
        customer = idOf(session.customer);
        subscription = idOf(session.subscription);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        customer = idOf(sub.customer);
        subscription = sub.id;
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        customer = idOf(invoice.customer);
        subscription = idOf(invoice.parent?.subscription_details?.subscription);
        break;
      }
      default:
        return null;
    }

    return customer && subscription ? { customerId: customer, subscriptionId: subscription } : null;
  }

  private async syncSubscription(customerId: string, subscriptionId: string): Promise<void> {
    // O tenant sai do customer que NÓS criamos e gravamos. Customer desconhecido (ex.: assinatura de
    // outro produto na mesma conta do Stripe, como o TotalPousada) é ignorado com 200.
    const tenant = await this.prisma.tenant.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (!tenant) return;

    const subscription = await this.stripe.sdk.subscriptions.retrieve(subscriptionId);
    if (subscription.metadata?.product !== "totalagenda" || subscription.metadata?.tenantId !== tenant.id) {
      this.logger.warn(`Assinatura ${subscriptionId} ignorada: metadata não confere com o tenant do customer.`);
      return;
    }
    const item = subscription.items.data[0];
    if (!item) return;

    const existing = await this.prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    if (
      existing?.stripeSubscriptionId &&
      existing.stripeSubscriptionId !== subscription.id &&
      ENDED.has(subscription.status)
    ) {
      return;
    }

    // O plano vem do Price (env), nunca de um nome. Price desconhecido não muda o plano.
    const tier = this.stripe.tierForPriceId(item.price.id);
    let planId = existing?.planId;
    if (tier) {
      planId = (await this.prisma.plan.findUnique({ where: { tier } }))?.id ?? planId;
    } else {
      this.logger.error(`Price ${item.price.id} da assinatura ${subscription.id} não corresponde a nenhum plano.`);
    }
    if (!planId) {
      this.logger.error(`Assinatura ${subscription.id} sem plano local para gravar; ignorada.`);
      return;
    }

    const status = STATUS_MAP[subscription.status];
    const data = {
      planId,
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
    await this.prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: data,
      create: { tenantId: tenant.id, ...data },
    });

    await this.warnIfOverLimit(tenant.id, planId);
  }

  // A troca de plano pelo Portal está desligada, mas se algo mudar o plano por fora, o dono pode ficar
  // com mais profissionais ativos que o limite. O PlanLimitService só trava novos cadastros; aqui só avisa.
  private async warnIfOverLimit(tenantId: string, planId: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, select: { maxProfessionals: true } });
    if (!plan || plan.maxProfessionals === null) return;
    const active = await this.prisma.professional.count({ where: { tenantId, isActive: true } });
    if (active > plan.maxProfessionals) {
      this.logger.warn(`Tenant ${tenantId} tem ${active} profissionais ativos, acima do limite do plano (${plan.maxProfessionals}).`);
    }
  }

  private async markProcessed(event: Stripe.Event): Promise<void> {
    try {
      await this.prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    } catch (error) {
      // Duas entregas do mesmo evento processadas ao mesmo tempo: a segunda só encontra o registro.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
}

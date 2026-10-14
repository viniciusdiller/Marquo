import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PlanTier, SubscriptionStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { StripeService } from "./stripe.service";
import { failStripeCall } from "./stripe-errors";

// Com assinatura nestes estados um novo checkout criaria uma SEGUNDA assinatura no mesmo customer
// (cobrança em dobro). Ativa/em atraso/não paga se resolvem pelo portal ou pela troca de plano;
// só cancelada ou incompleta (checkout abandonado) pode assinar de novo.
const BLOCKS_NEW_CHECKOUT: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
]);

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // O dono escolhe só o plano. Preço (Price do env), customer e tenant saem do servidor/JWT, e as
  // URLs de retorno são montadas aqui a partir de FRONTEND_URL.
  async createCheckout(user: AuthenticatedUser, tier: PlanTier): Promise<{ url: string }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      include: { subscription: true },
    });

    if (tenant.subscription && BLOCKS_NEW_CHECKOUT.has(tenant.subscription.status)) {
      throw new ConflictException(
        tenant.subscription.status === SubscriptionStatus.ACTIVE
          ? 'Você já tem uma assinatura ativa. Use "Trocar plano" ou "Gerenciar pagamento".'
          : 'O pagamento da sua assinatura precisa ser regularizado. Use "Gerenciar pagamento".',
      );
    }

    // Plano precisa existir localmente: o webhook grava Subscription.planId.
    const plan = await this.prisma.plan.findUnique({ where: { tier } });
    if (!plan) throw new NotFoundException("Plano não encontrado.");

    // Antes de criar qualquer coisa no Stripe: sem configuração, 503 sem efeito colateral.
    const priceId = this.stripe.priceIdForTier(tier);
    // Também sem efeito colateral: se o Price do Stripe não tiver o valor do catálogo, ninguém é cobrado.
    await this.stripe.assertPriceMatchesCatalog(tier);
    const customerId = await this.ensureCustomer(tenant.id, tenant.name, tenant.stripeCustomerId, user.userId);
    const base = this.stripe.frontendUrl();
    const metadata = { tenantId: tenant.id, product: "totalagenda" };

    try {
      const session = await this.stripe.sdk.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/dashboard/plano?checkout=success`,
        cancel_url: `${base}/dashboard/plano?checkout=cancelled`,
        client_reference_id: tenant.id,
        // A metadata da assinatura é o que o webhook confere para não confundir com outro produto.
        subscription_data: { metadata },
        metadata,
        locale: "pt-BR",
      });
      if (!session.url) throw new BadGatewayException("O serviço de pagamento não devolveu o link.");
      return { url: session.url };
    } catch (error) {
      return failStripeCall(this.logger, "criar a sessão de checkout", error);
    }
  }

  // Portal do Stripe (forma de pagamento, faturas, cancelamento). Só do customer do PRÓPRIO tenant.
  async createPortal(user: AuthenticatedUser): Promise<{ url: string }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    if (!tenant.stripeCustomerId) {
      throw new ConflictException("Você ainda não tem uma assinatura para gerenciar.");
    }

    try {
      const session = await this.stripe.sdk.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: `${this.stripe.frontendUrl()}/dashboard/plano`,
      });
      return { url: session.url };
    } catch (error) {
      return failStripeCall(this.logger, "abrir o portal de cobrança", error);
    }
  }

  // Cria o customer do Stripe uma única vez por tenant. A chave de idempotência cobre duas
  // requisições simultâneas, e o UPDATE condicional (só se ainda nulo) garante um vencedor: quem
  // perde a corrida usa o customer que já foi gravado.
  private async ensureCustomer(
    tenantId: string,
    tenantName: string,
    existing: string | null,
    userId: string,
  ): Promise<string> {
    if (existing) return existing;

    const owner = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { email: true },
    });

    let customerId: string;
    try {
      const customer = await this.stripe.sdk.customers.create(
        { name: tenantName, email: owner?.email, metadata: { tenantId, product: "totalagenda" } },
        { idempotencyKey: `totalagenda-customer-${tenantId}` },
      );
      customerId = customer.id;
    } catch (error) {
      return failStripeCall(this.logger, "criar o cliente de cobrança", error);
    }

    const saved = await this.prisma.tenant.updateMany({
      where: { id: tenantId, stripeCustomerId: null },
      data: { stripeCustomerId: customerId },
    });
    if (saved.count === 1) return customerId;

    const winner = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { stripeCustomerId: true },
    });
    return winner.stripeCustomerId ?? customerId;
  }
}

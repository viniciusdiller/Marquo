import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PlanTier } from "@marquo/database";
import { PLAN_CURRENCY, PLAN_INTERVAL, planCatalogEntry } from "@marquo/shared-types";
import Stripe from "stripe";
import { failStripeCall } from "./stripe-errors";

const PRICE_ENV_BY_TIER: Record<PlanTier, string> = {
  [PlanTier.ESSENCIAL]: "STRIPE_PRICE_ESSENCIAL",
  [PlanTier.PROFISSIONAL]: "STRIPE_PRICE_PROFISSIONAL",
  [PlanTier.PREMIUM]: "STRIPE_PRICE_PREMIUM",
};

export const BILLING_NOT_CONFIGURED_MESSAGE = "Cobrança não configurada neste ambiente.";
export const PLAN_PRICE_MISMATCH_MESSAGE = "A cobrança deste plano está indisponível no momento. Fale com o suporte.";

// Uma conferência bem-sucedida vale por este tempo (o valor de um Price do Stripe é imutável; só a chave do
// env ou o catálogo mudam, e ambos exigem deploy). Falha nunca é guardada: o próximo pedido confere de novo.
const PRICE_CHECK_TTL_MS = 10 * 60 * 1000;

// Único ponto que fala com o SDK do Stripe e que conhece a configuração de cobrança. Em
// desenvolvimento as variáveis são opcionais: sem elas o backend sobe normalmente e só as rotas de
// cobrança respondem 503 (em produção o boot falha, ver env.validation.ts).
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;
  private readonly verifiedAt = new Map<PlanTier, number>();

  constructor(private readonly config: ConfigService) {}

  // Cliente criado só na primeira chamada. Retentativas de rede só para chamadas idempotentes (o
  // SDK já manda idempotency key nas escritas que ele mesmo repete) e timeout curto: a requisição do
  // dono espera por isto.
  get sdk(): Stripe {
    const key = this.config.get<string>("STRIPE_SECRET_KEY");
    if (!key) throw new ServiceUnavailableException(BILLING_NOT_CONFIGURED_MESSAGE);
    this.client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
    return this.client;
  }

  get webhookSecret(): string | undefined {
    return this.config.get<string>("STRIPE_WEBHOOK_SECRET") || undefined;
  }

  // O preço cobrado SEMPRE vem daqui (env), nunca do cliente: o cliente só escolhe o tier.
  priceIdForTier(tier: PlanTier): string {
    const priceId = this.config.get<string>(PRICE_ENV_BY_TIER[tier]);
    if (!priceId) throw new ServiceUnavailableException(BILLING_NOT_CONFIGURED_MESSAGE);
    return priceId;
  }

  // O valor MOSTRADO (catálogo → tabela Plan → GET /plans) precisa ser o valor COBRADO (Price do Stripe). Nada mais
  // liga os dois, então antes de cobrar conferimos o Price real: mesmo valor, BRL, recorrente mensal e ativo. Se
  // divergir, falha fechado (503) em vez de cobrar diferente do que a tela prometeu.
  async assertPriceMatchesCatalog(tier: PlanTier): Promise<void> {
    const checkedAt = this.verifiedAt.get(tier);
    if (checkedAt !== undefined && Date.now() - checkedAt < PRICE_CHECK_TTL_MS) return;

    const entry = planCatalogEntry(tier);
    if (!entry) throw new ServiceUnavailableException(PLAN_PRICE_MISMATCH_MESSAGE);
    const priceId = this.priceIdForTier(tier);

    let price: Stripe.Price;
    try {
      price = await this.sdk.prices.retrieve(priceId);
    } catch (error) {
      return failStripeCall(this.logger, "conferir o preço do plano", error);
    }

    const matches =
      price.active &&
      price.type === "recurring" &&
      price.unit_amount === entry.priceCents &&
      price.currency === PLAN_CURRENCY &&
      price.recurring?.interval === PLAN_INTERVAL &&
      price.recurring.interval_count === 1;
    if (!matches) {
      // Só valores e tier no log (nada de chave nem dados de cliente).
      this.logger.error(
        `Price do Stripe diverge do catálogo (plano=${tier}, esperado=${entry.priceCents} ${PLAN_CURRENCY}/${PLAN_INTERVAL}, ` +
          `stripe=${price.unit_amount ?? "?"} ${price.currency}/${price.recurring?.interval ?? "?"}, ativo=${price.active}).`,
      );
      throw new ServiceUnavailableException(PLAN_PRICE_MISMATCH_MESSAGE);
    }
    this.verifiedAt.set(tier, Date.now());
  }

  // Caminho inverso, usado pelo webhook: o Price da assinatura diz qual plano ela é (nunca o nome).
  tierForPriceId(priceId: string): PlanTier | null {
    for (const tier of Object.values(PlanTier)) {
      if (this.config.get<string>(PRICE_ENV_BY_TIER[tier]) === priceId) return tier;
    }
    return null;
  }

  // Destino dos retornos do checkout e do portal. Montado no servidor; nunca vem do cliente.
  frontendUrl(): string {
    return (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  }
}

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PlanTier } from "@marquo/database";
import { PLAN_CATALOG } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { StripeService } from "./stripe.service";

const PRICE_ENV_BY_TIER: Record<PlanTier, string> = {
  [PlanTier.ESSENCIAL]: "STRIPE_PRICE_ESSENCIAL",
  [PlanTier.PROFISSIONAL]: "STRIPE_PRICE_PROFISSIONAL",
  [PlanTier.PREMIUM]: "STRIPE_PRICE_PREMIUM",
};

// A tabela `Plan` é ESPELHO do catálogo (packages/shared-types/src/index.ts): a cada boot ela é regravada a partir
// dele. Mudar preço ou limite = editar o catálogo + deploy; nada de UPDATE manual nem migration (a migration
// `seed_plans` guarda valores antigos de propósito, e este sync os corrige no primeiro boot).
@Injectable()
export class PlanCatalogService implements OnModuleInit {
  private readonly logger = new Logger(PlanCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncPlans();
    // Não segura o boot: a conferência fala com o Stripe pela rede. O que protege o cliente é a checagem feita no
    // checkout e na troca de plano; isto só avisa cedo (no log do deploy) que o Price está errado.
    void this.warnOnStripeMismatch();
  }

  async syncPlans(): Promise<void> {
    for (const entry of PLAN_CATALOG) {
      const tier = entry.tier as PlanTier;
      const stripePriceId = this.config.get<string>(PRICE_ENV_BY_TIER[tier]) || undefined;
      const values = {
        name: entry.name,
        priceCents: entry.priceCents,
        maxProfessionals: entry.maxProfessionals,
      };
      await this.prisma.plan.upsert({
        where: { tier },
        // Sem o Price no env (dev) mantém o que já estava gravado, em vez de sobrescrever com placeholder.
        update: { ...values, ...(stripePriceId ? { stripePriceId } : {}) },
        create: { tier, ...values, stripePriceId: stripePriceId ?? `price_${tier.toLowerCase()}_pending` },
      });
    }
    this.logger.log(`Planos sincronizados com o catálogo (${PLAN_CATALOG.length}).`);
  }

  private async warnOnStripeMismatch(): Promise<void> {
    if (!this.config.get<string>("STRIPE_SECRET_KEY")) return;
    for (const entry of PLAN_CATALOG) {
      try {
        await this.stripe.assertPriceMatchesCatalog(entry.tier as PlanTier);
      } catch {
        // O detalhe já foi logado por assertPriceMatchesCatalog; aqui só não deixa a rejeição sem tratamento.
        this.logger.warn(`Cobrança do plano ${entry.tier} ficará indisponível até o Price do Stripe bater com o catálogo.`);
      }
    }
  }
}

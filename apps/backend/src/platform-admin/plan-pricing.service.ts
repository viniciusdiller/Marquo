import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { BillingMethod, PlanTier, SubscriptionStatus } from "@marquo/database";
import { PLAN_CATALOG, planCatalogEntry } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { MIN_CHARGE_CENTS } from "../billing/payments/pricing";

export const AUDIT_PLAN_PRICE_SET = "PLAN_PRICE_SET";

const reais = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

// Preço de cada plano pelo painel da plataforma. O banco (`Plan.priceCents`) é o que a cobrança lê; o catálogo
// (shared-types) é o TETO: dá para baixar e voltar até o preço de tabela, nunca acima (reajuste com cliente real é
// migração deliberada, ver CLAUDE.md). O valor chega em centavos e é limitado aqui: piso = MIN_CHARGE_CENTS (o mesmo
// piso do desconto de cupom) e planos maiores continuam estritamente mais caros que os menores.
@Injectable()
export class PlanPricingService {
  private readonly logger = new Logger(PlanPricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const plans = await this.prisma.plan.findMany({
      select: { id: true, tier: true, priceCents: true },
    });
    // Quem paga no cartão continua no valor combinado no provedor: só o novo preço vale para quem assinar depois.
    const cardGroups = await this.prisma.subscription.groupBy({
      by: ["planId"],
      where: { courtesy: false, method: BillingMethod.CARD_RECURRING, status: SubscriptionStatus.ACTIVE },
      _count: { id: true },
    });
    const cardByPlanId = new Map(cardGroups.map((g) => [g.planId, g._count?.id ?? 0] as const));

    return PLAN_CATALOG.map((entry) => {
      const plan = plans.find((p) => p.tier === entry.tier);
      return {
        tier: entry.tier,
        name: entry.name,
        priceCents: plan?.priceCents ?? entry.priceCents,
        listPriceCents: entry.priceCents,
        minPriceCents: MIN_CHARGE_CENTS,
        discounted: (plan?.priceCents ?? entry.priceCents) < entry.priceCents,
        maxProfessionals: entry.maxProfessionals,
        cardSubscribers: plan ? (cardByPlanId.get(plan.id) ?? 0) : 0,
      };
    });
  }

  async setPrice(tier: string, priceCents: number, actor: string) {
    const entry = planCatalogEntry(tier);
    // O DTO e o controller já barram; o service é chamado direto em testes e outros pontos.
    if (!entry) throw new NotFoundException("Plano não encontrado.");
    if (!Number.isInteger(priceCents) || priceCents < MIN_CHARGE_CENTS) {
      throw new BadRequestException(`O preço mínimo é ${reais(MIN_CHARGE_CENTS)}.`);
    }
    if (priceCents > entry.priceCents) {
      throw new BadRequestException(`O preço não pode passar do preço de tabela (${reais(entry.priceCents)}).`);
    }

    const plans = await this.prisma.plan.findMany({ select: { tier: true, priceCents: true } });
    const current = plans.find((p) => p.tier === tier);
    if (!current) throw new NotFoundException("Plano não encontrado.");
    if (current.priceCents === priceCents) throw new ConflictException("Este já é o preço atual do plano.");

    // Plano maior nunca fica mais barato (ou igual) que o menor: seria erro de digitação, e o dono "subiria" pagando menos.
    const index = PLAN_CATALOG.findIndex((p) => p.tier === tier);
    const price = (t: string) => plans.find((p) => p.tier === t)?.priceCents;
    const below = index > 0 ? price(PLAN_CATALOG[index - 1].tier) : undefined;
    const above = index < PLAN_CATALOG.length - 1 ? price(PLAN_CATALOG[index + 1].tier) : undefined;
    if (below !== undefined && priceCents <= below) {
      throw new BadRequestException(`O ${entry.name} precisa custar mais que o plano anterior (${reais(below)}).`);
    }
    if (above !== undefined && priceCents >= above) {
      throw new BadRequestException(`O ${entry.name} precisa custar menos que o plano seguinte (${reais(above)}).`);
    }

    // O preço lido vai no WHERE: se outra alteração rodou entre a leitura e a escrita, esta falha em vez de sobrescrever,
    // e a auditoria nunca guarda um valor que não aconteceu.
    const changed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.plan.updateMany({
        where: { tier: tier as PlanTier, priceCents: current.priceCents },
        data: { priceCents, priceOverrideCents: priceCents === entry.priceCents ? null : priceCents },
      });
      if (updated.count === 1) {
        await tx.adminAuditLog.create({
          data: { action: AUDIT_PLAN_PRICE_SET, actor, detail: `${entry.name}: ${reais(current.priceCents)} → ${reais(priceCents)}` },
        });
      }
      return updated.count;
    });
    if (changed === 0) throw new ConflictException("O preço mudou enquanto você editava. Recarregue e tente de novo.");

    this.logger.log(`Preço do plano ${tier} alterado para ${priceCents} centavos por ${actor}.`);
    return (await this.list()).find((p) => p.tier === tier);
  }
}

import { PlanTier } from "@marquo/database";
import { PLAN_CATALOG, planCatalogEntry } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { PlanCatalogService } from "./plan-catalog.service";

describe("PLAN_CATALOG (fonte única de preço e limite)", () => {
  it("tem os três tiers do banco, uma vez cada, na ordem do plano de entrada ao maior", () => {
    expect(PLAN_CATALOG.map((p) => p.tier)).toEqual(Object.values(PlanTier));
    expect(new Set(PLAN_CATALOG.map((p) => p.tier)).size).toBe(PLAN_CATALOG.length);
  });

  // Um plano maior mais barato (ou com menos vagas) que o anterior é erro de digitação ao editar o catálogo.
  it("preço e limite só crescem, e o último plano é ilimitado", () => {
    for (let i = 1; i < PLAN_CATALOG.length; i++) {
      expect(PLAN_CATALOG[i].priceCents).toBeGreaterThan(PLAN_CATALOG[i - 1].priceCents);
      const prev = PLAN_CATALOG[i - 1].maxProfessionals;
      const cur = PLAN_CATALOG[i].maxProfessionals;
      if (cur !== null) expect(cur).toBeGreaterThan(prev as number);
    }
    expect(PLAN_CATALOG.at(-1)!.maxProfessionals).toBeNull();
  });

  it("dinheiro em centavos inteiros (nunca float) e textos preenchidos", () => {
    for (const plan of PLAN_CATALOG) {
      expect(Number.isInteger(plan.priceCents)).toBe(true);
      expect(plan.priceCents).toBeGreaterThan(0);
      expect(plan.name.length).toBeGreaterThan(1);
      expect(plan.audience.length).toBeGreaterThan(10);
    }
  });

  it("planCatalogEntry acha por tier e devolve undefined para tier desconhecido", () => {
    expect(planCatalogEntry("PREMIUM")?.name).toBe("Premium");
    expect(planCatalogEntry("GRATIS")).toBeUndefined();
  });
});

function buildSync(overrides: Record<string, number | null> = {}) {
  const prisma = {
    plan: {
      findUnique: jest.fn(({ where }: { where: { tier: string } }) =>
        Promise.resolve(where.tier in overrides ? { priceOverrideCents: overrides[where.tier] } : null),
      ),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new PlanCatalogService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe("PlanCatalogService.syncPlans", () => {
  it("regrava name, preço e limite de CADA plano a partir do catálogo (o banco antigo é corrigido)", async () => {
    const { service, prisma } = buildSync();

    await service.syncPlans();

    expect(prisma.plan.upsert).toHaveBeenCalledTimes(PLAN_CATALOG.length);
    for (const entry of PLAN_CATALOG) {
      expect(prisma.plan.upsert).toHaveBeenCalledWith({
        where: { tier: entry.tier },
        update: { name: entry.name, priceCents: entry.priceCents, maxProfessionals: entry.maxProfessionals },
        create: {
          tier: entry.tier,
          name: entry.name,
          priceCents: entry.priceCents,
          maxProfessionals: entry.maxProfessionals,
        },
      });
    }
  });

  it("mantém o preço rebaixado pela plataforma (o desconto sobrevive ao boot)", async () => {
    const { service, prisma } = buildSync({ ESSENCIAL: 3990 });

    await service.syncPlans();

    const call = prisma.plan.upsert.mock.calls.find(([arg]) => arg.where.tier === "ESSENCIAL")![0];
    expect(call.update.priceCents).toBe(3990);
    const other = prisma.plan.upsert.mock.calls.find(([arg]) => arg.where.tier === "PROFISSIONAL")![0];
    expect(other.update.priceCents).toBe(planCatalogEntry("PROFISSIONAL")!.priceCents);
  });

  it("nunca cobra acima do catálogo, mesmo com desconto antigo maior que o preço de tabela", async () => {
    const { service, prisma } = buildSync({ ESSENCIAL: 999_999 });

    await service.syncPlans();

    const call = prisma.plan.upsert.mock.calls.find(([arg]) => arg.where.tier === "ESSENCIAL")![0];
    expect(call.update.priceCents).toBe(planCatalogEntry("ESSENCIAL")!.priceCents);
  });

  it("sincroniza no boot (onModuleInit)", async () => {
    const { service, prisma } = buildSync();
    await service.onModuleInit();
    expect(prisma.plan.upsert).toHaveBeenCalledTimes(PLAN_CATALOG.length);
  });
});

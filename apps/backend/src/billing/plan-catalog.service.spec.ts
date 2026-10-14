import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PlanTier } from "@marquo/database";
import { PLAN_CATALOG, PLAN_CURRENCY, PLAN_INTERVAL, planCatalogEntry } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { PlanCatalogService } from "./plan-catalog.service";
import { PLAN_PRICE_MISMATCH_MESSAGE, StripeService } from "./stripe.service";

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

function buildSync(env: Record<string, string | undefined> = {}) {
  const prisma = { plan: { upsert: jest.fn().mockResolvedValue({}) } };
  const stripe = { assertPriceMatchesCatalog: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new PlanCatalogService(prisma as unknown as PrismaService, stripe as unknown as StripeService, config);
  return { service, prisma, stripe };
}

describe("PlanCatalogService.syncPlans", () => {
  it("regrava name, preço e limite de CADA plano a partir do catálogo (o banco antigo é corrigido)", async () => {
    const { service, prisma } = buildSync();

    await service.syncPlans();

    expect(prisma.plan.upsert).toHaveBeenCalledTimes(PLAN_CATALOG.length);
    for (const entry of PLAN_CATALOG) {
      expect(prisma.plan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tier: entry.tier },
          update: expect.objectContaining({
            name: entry.name,
            priceCents: entry.priceCents,
            maxProfessionals: entry.maxProfessionals,
          }),
        }),
      );
    }
  });

  it("com STRIPE_PRICE_* no env grava o id real; sem ele NÃO sobrescreve o que já estava (nada de placeholder por cima)", async () => {
    const withEnv = buildSync({ STRIPE_PRICE_PREMIUM: "price_real_prem" });
    await withEnv.service.syncPlans();
    const premium = withEnv.prisma.plan.upsert.mock.calls.find(([arg]) => arg.where.tier === "PREMIUM")![0];
    expect(premium.update.stripePriceId).toBe("price_real_prem");
    expect(premium.create.stripePriceId).toBe("price_real_prem");
    const essencial = withEnv.prisma.plan.upsert.mock.calls.find(([arg]) => arg.where.tier === "ESSENCIAL")![0];
    expect(essencial.update).not.toHaveProperty("stripePriceId");
    expect(essencial.create.stripePriceId).toBe("price_essencial_pending");
  });
});

describe("PlanCatalogService.onModuleInit", () => {
  it("sincroniza e, com Stripe configurado, confere os três Prices sem travar o boot quando divergem", async () => {
    const { service, stripe } = buildSync({ STRIPE_SECRET_KEY: "sk_test_x" });
    stripe.assertPriceMatchesCatalog.mockRejectedValue(new ServiceUnavailableException(PLAN_PRICE_MISMATCH_MESSAGE));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));

    expect(stripe.assertPriceMatchesCatalog).toHaveBeenCalledTimes(PLAN_CATALOG.length);
  });

  it("sem STRIPE_SECRET_KEY (dev) não chama o Stripe", async () => {
    const { service, stripe } = buildSync();

    await service.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(stripe.assertPriceMatchesCatalog).not.toHaveBeenCalled();
  });
});

function buildStripe(price: Record<string, unknown> | Error, env: Record<string, string> = { STRIPE_PRICE_PROFISSIONAL: "price_pro" }) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new StripeService(config);
  const retrieve = jest.fn().mockImplementation(() => (price instanceof Error ? Promise.reject(price) : Promise.resolve(price)));
  Object.defineProperty(service, "sdk", { get: () => ({ prices: { retrieve } }) });
  return { service, retrieve };
}

const PRO = planCatalogEntry("PROFISSIONAL")!;
const goodPrice = {
  active: true,
  type: "recurring",
  unit_amount: PRO.priceCents,
  currency: PLAN_CURRENCY,
  recurring: { interval: PLAN_INTERVAL, interval_count: 1 },
};

describe("StripeService.assertPriceMatchesCatalog", () => {
  it("aceita o Price com o valor, a moeda e o ciclo do catálogo", async () => {
    const { service, retrieve } = buildStripe(goodPrice);

    await expect(service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL)).resolves.toBeUndefined();
    expect(retrieve).toHaveBeenCalledWith("price_pro");
  });

  // Estes são os erros reais que fariam o cliente ver um valor e pagar outro.
  it.each([
    ["valor diferente", { ...goodPrice, unit_amount: PRO.priceCents - 1000 }],
    ["valor antigo (29,90 → Price não recriado)", { ...goodPrice, unit_amount: 7990 }],
    ["moeda diferente", { ...goodPrice, currency: "usd" }],
    ["cobrança anual", { ...goodPrice, recurring: { interval: "year", interval_count: 1 } }],
    ["a cada 3 meses", { ...goodPrice, recurring: { interval: "month", interval_count: 3 } }],
    ["Price pontual (não recorrente)", { ...goodPrice, type: "one_time", recurring: null }],
    ["Price arquivado", { ...goodPrice, active: false }],
    ["preço escalonado (sem unit_amount)", { ...goodPrice, unit_amount: null }],
  ])("recusa com 503 quando o Price tem %s", async (_label, price) => {
    const { service } = buildStripe(price);

    const attempt = service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL);

    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toThrow(PLAN_PRICE_MISMATCH_MESSAGE);
  });

  it("não guarda falha: depois de corrigir o Price no Stripe a próxima tentativa passa", async () => {
    const { service, retrieve } = buildStripe({ ...goodPrice, unit_amount: 1 });
    await expect(service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL)).rejects.toThrow();

    retrieve.mockResolvedValue(goodPrice);

    await expect(service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL)).resolves.toBeUndefined();
  });

  it("guarda o sucesso: a segunda conferência não volta ao Stripe", async () => {
    const { service, retrieve } = buildStripe(goodPrice);

    await service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL);
    await service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL);

    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("falha de rede/Stripe vira 502 genérico sem vazar a mensagem original", async () => {
    const { service } = buildStripe(Object.assign(new Error("connect ECONNREFUSED sk_test_SEGREDO"), { type: "StripeConnectionError" }));

    const attempt = service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL);

    await expect(attempt).rejects.toThrow(/serviço de pagamento/);
    await expect(attempt).rejects.not.toThrow(/sk_test|ECONNREFUSED/);
  });

  it("sem o Price no env (cobrança não configurada) responde 503 sem chamar o Stripe", async () => {
    const { service, retrieve } = buildStripe(goodPrice, {});

    await expect(service.assertPriceMatchesCatalog(PlanTier.PROFISSIONAL)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(retrieve).not.toHaveBeenCalled();
  });
});

import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";
import { MercadoPagoClient } from "./payments/mercadopago.client";

const mp = { isConfigured: () => true } as unknown as MercadoPagoClient;

function buildPrisma(tenant: Record<string, unknown>) {
  return {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(tenant) },
  } as unknown as PrismaService;
}

const PLAN = {
  id: "plan-secret-id",
  tier: "PROFISSIONAL",
  name: "Profissional",
  priceCents: 7990,
  maxProfessionals: 5,
};

describe("BillingService.getTenantBillingStatus", () => {
  // Qualquer papel de staff (inclusive recepção e profissional) chama esta rota: nada de id do
  // plano ou da assinatura na resposta.
  it("não vaza ids internos", async () => {
    const trialEndsAt = new Date(Date.now() + 86_400_000);
    const currentPeriodEnd = new Date(Date.now() + 5 * 86_400_000);
    const prisma = buildPrisma({
      id: "tenant-1",
      trialEndsAt,
      subscription: {
        id: "sub-row-id",
        tenantId: "tenant-1",
        planId: "plan-secret-id",
        status: "ACTIVE",
        courtesy: false,
        method: null,
        providerSubscriptionId: "preapproval-secreto",
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        plan: PLAN,
      },
    });

    const result = await new BillingService(prisma, mp).getTenantBillingStatus("tenant-1");

    expect(result).toEqual({
      status: "ACTIVE",
      trialEndsAt,
      paymentsEnabled: true,
      subscription: {
        status: "ACTIVE",
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        courtesy: false,
        method: null,
        plan: { tier: "PROFISSIONAL", name: "Profissional", priceCents: 7990, maxProfessionals: 5 },
      },
    });
    const serialized = JSON.stringify(result);
    for (const secret of ["plan-secret-id", "sub-row-id", "tenant-1", "preapproval-secreto"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("sem assinatura devolve subscription null e o estado do trial", async () => {
    const trialEndsAt = new Date(Date.now() + 86_400_000);
    const prisma = buildPrisma({ id: "tenant-1", trialEndsAt, subscription: null });

    await expect(new BillingService(prisma, mp).getTenantBillingStatus("tenant-1")).resolves.toEqual({
      status: "TRIALING",
      trialEndsAt,
      paymentsEnabled: true,
      subscription: null,
    });
  });

  it("consulta pelo tenant do JWT", async () => {
    const prisma = buildPrisma({ trialEndsAt: new Date(), subscription: null });

    await new BillingService(prisma, mp).getTenantBillingStatus("tenant-do-jwt");

    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tenant-do-jwt" } }),
    );
  });
});

describe("BillingService.listPlans", () => {
  // GET /plans é público: devolvia a linha inteira de Plan (com id interno).
  it("seleciona só tier, nome, preço e limite, ordenado por preço", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { plan: { findMany } } as unknown as PrismaService;

    await new BillingService(prisma, mp).listPlans();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { priceCents: "asc" },
      select: { tier: true, name: true, priceCents: true, maxProfessionals: true },
    });
  });
});

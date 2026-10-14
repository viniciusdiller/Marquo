import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PlanTier } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { PlanChangeService } from "./plan-change.service";
import { StripeService } from "./stripe.service";

const TENANT = "tenant-do-jwt";
const PLANS = {
  ESSENCIAL: { id: "p-ess", tier: "ESSENCIAL", name: "Essencial", priceCents: 2990, maxProfessionals: 2 },
  PROFISSIONAL: { id: "p-pro", tier: "PROFISSIONAL", name: "Profissional", priceCents: 7990, maxProfessionals: 5 },
  PREMIUM: { id: "p-prem", tier: "PREMIUM", name: "Premium", priceCents: 14990, maxProfessionals: null },
} as const;

function professionals(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `prof-${i + 1}`,
    user: { name: `Profissional ${i + 1}`, email: `p${i + 1}@x.com` },
  }));
}

interface Options {
  current?: keyof typeof PLANS;
  status?: string;
  activeCount?: number;
  subscription?: Record<string, unknown> | null;
  future?: Record<string, number>; // professionalId -> agendamentos futuros
  chosenFound?: number | null; // quantos dos ids escolhidos "existem" (ativos no tenant)
  stripeMetadata?: Record<string, string>;
  stripeUpdate?: jest.Mock;
  stripeOverrides?: Record<string, unknown>;
}

function build(o: Options = {}) {
  const current = PLANS[o.current ?? "PROFISSIONAL"];
  const subscription =
    o.subscription === undefined
      ? { tenantId: TENANT, status: o.status ?? "ACTIVE", stripeSubscriptionId: "sub_1", plan: current }
      : o.subscription;
  const active = professionals(o.activeCount ?? 3);

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    professional: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => {
        if (where.id) {
          const ids = where.id.in;
          const found = o.chosenFound === undefined || o.chosenFound === null ? ids.length : o.chosenFound;
          return Promise.resolve(ids.slice(0, found).map((id) => ({ id, user: { name: `Nome ${id}` } })));
        }
        return Promise.resolve(active.map((p) => ({ id: p.id })));
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    appointment: {
      groupBy: jest.fn().mockImplementation(({ where }: { where: { professionalId: { in: string[] } } }) =>
        Promise.resolve(
          where.professionalId.in
            .filter((id) => (o.future?.[id] ?? 0) > 0)
            .map((id) => ({ professionalId: id, _count: { _all: o.future?.[id] } })),
        ),
      ),
    },
    subscription: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    subscription: { findUnique: jest.fn().mockResolvedValue(subscription) },
    plan: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { tier: keyof typeof PLANS } }) =>
        Promise.resolve(PLANS[where.tier] ?? null),
      ),
    },
    professional: {
      findMany: jest.fn().mockResolvedValue(active),
    },
    appointment: tx.appointment,
    $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const stripeUpdate = o.stripeUpdate ?? jest.fn().mockResolvedValue({});
  const sdk = {
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({
        id: "sub_1",
        metadata: o.stripeMetadata ?? { tenantId: TENANT, product: "totalagenda" },
        items: { data: [{ id: "si_1", price: { id: "price_atual" } }] },
      }),
      update: stripeUpdate,
    },
  };
  const stripe = {
    sdk,
    priceIdForTier: jest.fn((tier: PlanTier) => `price_${tier.toLowerCase()}`),
    assertPriceMatchesCatalog: jest.fn().mockResolvedValue(undefined),
    ...o.stripeOverrides,
  } as unknown as StripeService;

  return { service: new PlanChangeService(prisma, stripe), prisma, tx, sdk, stripeUpdate };
}

describe("PlanChangeService.preview", () => {
  it("upgrade sem excesso: não lista profissionais", async () => {
    const { service } = build({ current: "ESSENCIAL", activeCount: 2 });

    await expect(service.preview(TENANT, PlanTier.PROFISSIONAL)).resolves.toEqual({
      currentTier: "ESSENCIAL",
      newTier: "PROFISSIONAL",
      direction: "UPGRADE",
      newLimit: 5,
      activeCount: 2,
      excess: 0,
      professionals: [],
    });
  });

  it("downgrade com excesso: mostra o excesso e quem tem agenda futura (não pode ser desativado)", async () => {
    const { service } = build({ current: "PROFISSIONAL", activeCount: 4, future: { "prof-2": 3 } });

    const result = await service.preview(TENANT, PlanTier.ESSENCIAL);

    expect(result.direction).toBe("DOWNGRADE");
    expect(result.excess).toBe(2);
    expect(result.newLimit).toBe(2);
    expect(result.professionals).toHaveLength(4);
    expect(result.professionals.find((p) => p.id === "prof-2")).toMatchObject({
      futureAppointments: 3,
      canDeactivate: false,
    });
    expect(result.professionals.find((p) => p.id === "prof-1")).toMatchObject({
      futureAppointments: 0,
      canDeactivate: true,
    });
  });

  it("plano ilimitado nunca tem excesso", async () => {
    const { service } = build({ current: "PROFISSIONAL", activeCount: 9 });

    await expect(service.preview(TENANT, PlanTier.PREMIUM)).resolves.toMatchObject({ excess: 0, newLimit: null });
  });

  it.each([
    ["sem assinatura", { subscription: null }],
    ["assinatura em atraso", { status: "PAST_DUE" }],
    ["assinatura cancelada", { status: "CANCELED" }],
  ])("recusa trocar de plano %s", async (_label, options) => {
    const { service } = build(options);

    await expect(service.preview(TENANT, PlanTier.PREMIUM)).rejects.toBeInstanceOf(ConflictException);
  });

  it("recusa 'trocar' para o plano em que já está", async () => {
    const { service } = build({ current: "PROFISSIONAL" });

    await expect(service.preview(TENANT, PlanTier.PROFISSIONAL)).rejects.toThrow("Você já está neste plano.");
  });
});

describe("PlanChangeService.change", () => {
  it("upgrade: troca o Price no Stripe com crédito proporcional e atualiza o plano local", async () => {
    const { service, tx, stripeUpdate } = build({ current: "ESSENCIAL", activeCount: 2 });

    await expect(service.change(TENANT, { tier: PlanTier.PREMIUM })).resolves.toEqual({
      tier: "PREMIUM",
      deactivated: 0,
    });

    expect(stripeUpdate).toHaveBeenCalledWith(
      "sub_1",
      { items: [{ id: "si_1", price: "price_premium" }], proration_behavior: "create_prorations" },
      { idempotencyKey: expect.stringMatching(/^plan-change-sub_1-price_atual-price_premium-\d+$/) },
    );
    expect(tx.subscription.update).toHaveBeenCalledWith({ where: { tenantId: TENANT }, data: { planId: "p-prem" } });
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
  });

  it("downgrade: desativa exatamente os escolhidos (do tenant) e SÓ DEPOIS troca no Stripe", async () => {
    const { service, tx, stripeUpdate } = build({ current: "PROFISSIONAL", activeCount: 4 });

    const result = await service.change(TENANT, {
      tier: PlanTier.ESSENCIAL,
      deactivateProfessionalIds: ["prof-3", "prof-4"],
    });

    expect(result).toEqual({ tier: "ESSENCIAL", deactivated: 2 });
    expect(tx.professional.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["prof-3", "prof-4"] }, tenantId: TENANT },
      data: { isActive: false },
    });
    // Stripe por último: se ele falhar, a transação (com as desativações) é revertida.
    const dbOrder = (tx.professional.updateMany as jest.Mock).mock.invocationCallOrder[0];
    const stripeOrder = stripeUpdate.mock.invocationCallOrder[0];
    expect(dbOrder).toBeLessThan(stripeOrder);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // lock por tenant
  });

  it.each([
    ["nenhum profissional", []],
    ["profissionais de menos", ["prof-3"]],
    ["profissionais demais", ["prof-1", "prof-2", "prof-3"]],
  ])("downgrade exige EXATAMENTE o excesso: %s -> 400, sem desativar e sem Stripe", async (_label, ids) => {
    const { service, tx, stripeUpdate } = build({ current: "PROFISSIONAL", activeCount: 4 });

    await expect(
      service.change(TENANT, { tier: PlanTier.ESSENCIAL, deactivateProfessionalIds: ids }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it("upgrade com ids de profissionais é recusado: o cliente não desativa gente à toa", async () => {
    const { service, tx, stripeUpdate } = build({ current: "ESSENCIAL", activeCount: 2 });

    await expect(
      service.change(TENANT, { tier: PlanTier.PROFISSIONAL, deactivateProfessionalIds: ["prof-1"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  // IDOR: id de outro tenant (ou já inativo) não é achado no WHERE {tenantId, isActive} e responde
  // igual a "não existe".
  it("id que não é de um profissional ATIVO deste tenant dá 404, sem desativar nada", async () => {
    const { service, tx, stripeUpdate } = build({ current: "PROFISSIONAL", activeCount: 4, chosenFound: 1 });

    await expect(
      service.change(TENANT, { tier: PlanTier.ESSENCIAL, deactivateProfessionalIds: ["prof-3", "prof-de-outro-tenant"] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(tx.professional.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["prof-3", "prof-de-outro-tenant"] }, tenantId: TENANT, isActive: true } }),
    );
  });

  // Mesma regra de PATCH /professionals/:id: desativar com agenda futura deixaria o agendamento
  // órfão (some do calendário, continua ocupando o horário).
  it("recusa desativar quem tem agendamento futuro e não muda nada", async () => {
    const { service, tx, stripeUpdate } = build({
      current: "PROFISSIONAL",
      activeCount: 4,
      future: { "prof-4": 2 },
    });

    const attempt = service.change(TENANT, {
      tier: PlanTier.ESSENCIAL,
      deactivateProfessionalIds: ["prof-3", "prof-4"],
    });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(/Nome prof-4.*2 agendamento\(s\) futuro\(s\)/);
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it("falha do Stripe vira 502 genérico e a transação NÃO confirma (as desativações são revertidas)", async () => {
    const stripeUpdate = jest.fn().mockRejectedValue(new Error("card_declined interno cus_secreto"));
    const { service, prisma, tx } = build({ current: "PROFISSIONAL", activeCount: 4, stripeUpdate });
    // Simula a semântica do Prisma: só "confirma" (commit) se o callback termina sem lançar erro.
    let committed = false;
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (t: typeof tx) => unknown) => {
      const result = await cb(tx);
      committed = true;
      return result;
    });

    const attempt = service.change(TENANT, {
      tier: PlanTier.ESSENCIAL,
      deactivateProfessionalIds: ["prof-3", "prof-4"],
    });

    await expect(attempt).rejects.toBeInstanceOf(BadGatewayException);
    await expect(attempt).rejects.not.toThrow(/cus_secreto|card_declined/);
    // As escritas aconteceram DENTRO da transação (antes do Stripe)...
    expect(tx.professional.updateMany).toHaveBeenCalled();
    // ...mas a transação não foi confirmada, então o banco reverte tudo.
    expect(committed).toBe(false);
  });

  it("assinatura do Stripe de outro tenant ou de outro produto não é alterada", async () => {
    const cases: Record<string, string>[] = [
      { tenantId: "outro-tenant", product: "totalagenda" },
      { tenantId: TENANT, product: "totalpousada" },
      {},
    ];
    for (const stripeMetadata of cases) {
      const { service, prisma, stripeUpdate } = build({ current: "ESSENCIAL", activeCount: 1, stripeMetadata });

      await expect(service.change(TENANT, { tier: PlanTier.PREMIUM })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(stripeUpdate).not.toHaveBeenCalled();
    }
  });

  it("sem id da assinatura no Stripe (ainda não confirmada) responde 409", async () => {
    const { service, stripeUpdate } = build({
      subscription: { tenantId: TENANT, status: "ACTIVE", stripeSubscriptionId: null, plan: PLANS.ESSENCIAL },
    });

    await expect(service.change(TENANT, { tier: PlanTier.PREMIUM })).rejects.toBeInstanceOf(ConflictException);
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it("lê a assinatura do tenant do JWT (WHERE tenantId)", async () => {
    const { service, prisma } = build({ current: "ESSENCIAL", activeCount: 1 });

    await service.change(TENANT, { tier: PlanTier.PREMIUM });

    expect(prisma.subscription.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT } }));
  });
});

describe("PlanChangeService.change: Price do Stripe diferente do catálogo", () => {
  it("recusa com 503 antes de ler ou alterar a assinatura no Stripe (e sem desativar ninguém)", async () => {
    const { service, sdk, tx } = build({
      current: "ESSENCIAL",
      activeCount: 2,
      stripeOverrides: {
        assertPriceMatchesCatalog: jest.fn().mockRejectedValue(new ServiceUnavailableException("indisponível")),
      },
    });

    await expect(service.change(TENANT, { tier: PlanTier.PREMIUM })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sdk.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(sdk.subscriptions.update).not.toHaveBeenCalled();
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
  });
});

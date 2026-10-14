import "reflect-metadata";
import { Prisma } from "@marquo/database";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { StripeService } from "../billing/stripe.service";
import { StripeWebhookService } from "./stripe-webhook.service";

const TENANT = "tenant-1";
const PERIOD_END = 1_800_000_000; // segundos

const PLAN_IDS: Record<string, string> = { ESSENCIAL: "plan-ess", PROFISSIONAL: "plan-pro", PREMIUM: "plan-prem" };
const TIER_BY_PRICE: Record<string, string> = { price_ess: "ESSENCIAL", price_pro: "PROFISSIONAL", price_prem: "PREMIUM" };

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { tenantId: TENANT, product: "totalagenda" },
    items: { data: [{ id: "si_1", price: { id: "price_pro" }, current_period_end: PERIOD_END }] },
    ...overrides,
  };
}

function build(options: {
  tenant?: unknown;
  existing?: Record<string, unknown> | null;
  subscription?: Record<string, unknown>;
  processed?: boolean;
  createEventError?: unknown;
  retrieveError?: unknown;
  activeProfessionals?: number;
} = {}) {
  const prisma = {
    stripeEvent: {
      findUnique: jest.fn().mockResolvedValue(options.processed ? { id: "evt_1" } : null),
      create: options.createEventError
        ? jest.fn().mockRejectedValue(options.createEventError)
        : jest.fn().mockResolvedValue({}),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue("tenant" in options ? options.tenant : { id: TENANT }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(options.existing ?? null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    plan: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { tier?: string; id?: string } }) => {
        if (where.tier) return Promise.resolve({ id: PLAN_IDS[where.tier], maxProfessionals: 5 });
        return Promise.resolve({ maxProfessionals: 5 });
      }),
    },
    professional: { count: jest.fn().mockResolvedValue(options.activeProfessionals ?? 1) },
  } as unknown as PrismaService;

  const retrieve = options.retrieveError
    ? jest.fn().mockRejectedValue(options.retrieveError)
    : jest.fn().mockResolvedValue(options.subscription ?? stripeSubscription());
  const stripe = {
    sdk: { subscriptions: { retrieve } },
    tierForPriceId: jest.fn((priceId: string) => TIER_BY_PRICE[priceId] ?? null),
  } as unknown as StripeService;

  return { service: new StripeWebhookService(prisma, stripe), prisma, retrieve };
}

const event = (type: string, object: Record<string, unknown>, id = "evt_1") =>
  ({ id, type, data: { object } }) as unknown as Stripe.Event;

const subscriptionEvent = (type = "customer.subscription.updated") =>
  event(type, { id: "sub_1", customer: "cus_1" });

describe("StripeWebhookService: o estado vem do Stripe, não do evento", () => {
  it("grava plano (pelo Price), status, fim do período e cancelamento agendado", async () => {
    const { service, prisma } = build({ subscription: stripeSubscription({ cancel_at_period_end: true }) });

    await service.handle(subscriptionEvent());

    expect(prisma.subscription.upsert).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      update: {
        planId: "plan-pro",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        currentPeriodEnd: new Date(PERIOD_END * 1000),
        cancelAtPeriodEnd: true,
      },
      create: expect.objectContaining({ tenantId: TENANT, planId: "plan-pro", status: "ACTIVE" }),
    });
  });

  it.each([
    ["active", "ACTIVE"],
    ["trialing", "ACTIVE"],
    ["past_due", "PAST_DUE"],
    ["unpaid", "UNPAID"],
    ["paused", "UNPAID"],
    ["canceled", "CANCELED"],
    ["incomplete", "INCOMPLETE"],
    ["incomplete_expired", "CANCELED"],
  ])("status %s do Stripe vira %s", async (stripeStatus, expected) => {
    const { service, prisma } = build({ subscription: stripeSubscription({ status: stripeStatus }) });

    await service.handle(subscriptionEvent());

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: expected }) }),
    );
  });

  // Upgrade/downgrade: antes só o status era sincronizado e o plano ficava para sempre no primeiro.
  it("mudança de plano no Stripe (novo Price) atualiza o plano local", async () => {
    const { service, prisma } = build({
      existing: { planId: "plan-ess", stripeSubscriptionId: "sub_1" },
      subscription: stripeSubscription({
        items: { data: [{ id: "si_1", price: { id: "price_prem" }, current_period_end: PERIOD_END }] },
      }),
    });

    await service.handle(subscriptionEvent());

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ planId: "plan-prem" }) }),
    );
  });

  it("Price desconhecido não muda o plano existente; sem plano nenhum, não grava", async () => {
    const unknownPrice = stripeSubscription({
      items: { data: [{ id: "si_1", price: { id: "price_desconhecido" }, current_period_end: PERIOD_END }] },
    });
    const withPlan = build({ existing: { planId: "plan-ess", stripeSubscriptionId: "sub_1" }, subscription: unknownPrice });
    await withPlan.service.handle(subscriptionEvent());
    expect(withPlan.prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ planId: "plan-ess" }) }),
    );

    const withoutPlan = build({ existing: null, subscription: unknownPrice });
    await withoutPlan.service.handle(subscriptionEvent());
    expect(withoutPlan.prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("extrai customer e assinatura de cada tipo de evento relevante", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["checkout.session.completed", { mode: "subscription", customer: "cus_1", subscription: "sub_1" }],
      ["customer.subscription.created", { id: "sub_1", customer: "cus_1" }],
      ["customer.subscription.deleted", { id: "sub_1", customer: { id: "cus_1" } }],
      ["invoice.paid", { customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } } }],
      ["invoice.payment_failed", { customer: "cus_1", parent: { subscription_details: { subscription: { id: "sub_1" } } } }],
    ];
    for (const [type, object] of cases) {
      const { service, prisma, retrieve } = build();
      await service.handle(event(type, object));
      expect(retrieve).toHaveBeenCalledWith("sub_1");
      expect(prisma.subscription.upsert).toHaveBeenCalledTimes(1);
    }
  });

  it("checkout que não é de assinatura e fatura sem assinatura não fazem nada", async () => {
    for (const ev of [
      event("checkout.session.completed", { mode: "payment", customer: "cus_1", subscription: null }),
      event("invoice.paid", { customer: "cus_1", parent: null }),
    ]) {
      const { service, prisma, retrieve } = build();
      await service.handle(ev);
      expect(retrieve).not.toHaveBeenCalled();
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    }
  });
});

describe("StripeWebhookService: isolamento entre produtos e tenants", () => {
  // Mesma conta do Stripe do Admin (TotalPousada): o evento chega aqui também.
  it("customer que não é de nenhum tenant é ignorado sem chamar o Stripe", async () => {
    const { service, prisma, retrieve } = build({ tenant: null });

    await service.handle(subscriptionEvent());

    expect(retrieve).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.stripeEvent.create).toHaveBeenCalled(); // ainda assim confirma o evento (200)
  });

  it.each([
    ["produto diferente", { tenantId: TENANT, product: "totalpousada" }],
    ["tenant diferente do customer", { tenantId: "outro-tenant", product: "totalagenda" }],
    ["sem metadata", {}],
  ])("assinatura com %s é ignorada", async (_label, metadata) => {
    const { service, prisma } = build({ subscription: stripeSubscription({ metadata }) });

    await service.handle(subscriptionEvent());

    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("procura o tenant pelo customer do evento (WHERE stripeCustomerId)", async () => {
    const { service, prisma } = build();

    await service.handle(subscriptionEvent());

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { stripeCustomerId: "cus_1" }, select: { id: true } });
  });

  // O "deleted" da assinatura antiga chega depois de o dono já ter assinado de novo.
  it("evento atrasado de uma assinatura ANTIGA encerrada não derruba a atual", async () => {
    const { service, prisma } = build({
      existing: { planId: "plan-pro", stripeSubscriptionId: "sub_NOVA" },
      subscription: stripeSubscription({ id: "sub_antiga", status: "canceled" }),
    });

    await service.handle(event("customer.subscription.deleted", { id: "sub_antiga", customer: "cus_1" }));

    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("assinatura NOVA e viva substitui a anterior encerrada", async () => {
    const { service, prisma } = build({
      existing: { planId: "plan-pro", stripeSubscriptionId: "sub_antiga" },
      subscription: stripeSubscription({ id: "sub_NOVA", status: "active" }),
    });

    await service.handle(event("customer.subscription.created", { id: "sub_NOVA", customer: "cus_1" }));

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ stripeSubscriptionId: "sub_NOVA", status: "ACTIVE" }) }),
    );
  });
});

describe("StripeWebhookService: idempotência e falhas", () => {
  it("evento já processado não faz nada (nem chama o Stripe)", async () => {
    const { service, prisma, retrieve } = build({ processed: true });

    await service.handle(subscriptionEvent());

    expect(retrieve).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.stripeEvent.create).not.toHaveBeenCalled();
  });

  it("marca o evento como processado só DEPOIS de gravar", async () => {
    const { service, prisma } = build();

    await service.handle(subscriptionEvent());

    const upsertOrder = (prisma.subscription.upsert as jest.Mock).mock.invocationCallOrder[0];
    const markOrder = (prisma.stripeEvent.create as jest.Mock).mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(markOrder);
    expect(prisma.stripeEvent.create).toHaveBeenCalledWith({
      data: { id: "evt_1", type: "customer.subscription.updated" },
    });
  });

  // Se falhar no meio, o erro sobe (500) e o Stripe reentrega: o evento NÃO pode ficar marcado.
  it("falha ao ler o Stripe propaga o erro e NÃO marca o evento como processado", async () => {
    const boom = new Error("Stripe fora do ar");
    const { service, prisma } = build({ retrieveError: boom });

    await expect(service.handle(subscriptionEvent())).rejects.toBe(boom);
    expect(prisma.stripeEvent.create).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("duas entregas simultâneas do mesmo evento: a violação única na marcação é tolerada", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    const { service } = build({ createEventError: duplicate });

    await expect(service.handle(subscriptionEvent())).resolves.toBeUndefined();
  });

  it("outro erro ao marcar o evento não é engolido", async () => {
    const other = new Error("conexão perdida");
    const { service } = build({ createEventError: other });

    await expect(service.handle(subscriptionEvent())).rejects.toBe(other);
  });

  it("eventos de outros tipos são reconhecidos sem processar nada", async () => {
    const { service, prisma, retrieve } = build();

    await service.handle(event("charge.succeeded", { id: "ch_1" }));

    expect(retrieve).not.toHaveBeenCalled();
    expect(prisma.stripeEvent.findUnique).not.toHaveBeenCalled();
    expect(prisma.stripeEvent.create).not.toHaveBeenCalled();
  });
});

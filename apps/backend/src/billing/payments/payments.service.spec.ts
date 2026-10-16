import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CouponsService } from "../../coupons/coupons.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PlanLimitService } from "../plan-limit.service";
import { PaymentProviderError, MercadoPagoClient } from "./mercadopago.client";
import { PaymentsService } from "./payments.service";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "33333333-3333-4333-8333-333333333333";
const DAY = 86_400_000;

const PLAN = { id: "plan-pro", tier: "PROFISSIONAL", name: "Profissional", priceCents: 9990, maxProfessionals: 5 };

interface World {
  subscription?: Record<string, unknown> | null;
  suspendedAt?: Date | null;
  attempt?: Record<string, unknown> | null;
  coupon?: Record<string, unknown> | null;
  pendingRedemption?: Record<string, unknown> | null;
  existingRedemption?: Record<string, unknown> | null;
  configured?: boolean;
}

function build(world: World = {}) {
  const state = { attempt: world.attempt ?? null, subscription: world.subscription ?? null };

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenant: {
      findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
        id: TENANT,
        suspendedAt: world.suspendedAt ?? null,
        subscription: state.subscription,
      })),
    },
    coupon: { findUnique: jest.fn().mockResolvedValue(world.coupon ?? null) },
    couponRedemption: {
      findUnique: jest.fn().mockResolvedValue(world.existingRedemption ?? null),
      findFirst: jest.fn().mockResolvedValue(world.pendingRedemption ?? null),
      create: jest.fn().mockResolvedValue({ id: "red-novo" }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    billingAttempt: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        state.attempt = { id: ATTEMPT, status: "PENDING", providerRef: null, expiresAt: new Date(Date.now() + DAY), ...data };
        return state.attempt;
      }),
      findUnique: jest.fn().mockImplementation(async () => state.attempt),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => state.attempt),
      update: jest.fn().mockImplementation(async ({ data }) => {
        state.attempt = { ...(state.attempt as object), ...data };
        return state.attempt;
      }),
    },
    subscription: {
      findUnique: jest.fn().mockImplementation(async () => state.subscription),
      upsert: jest.fn().mockImplementation(async ({ create, update }) => {
        state.subscription = { ...(state.subscription ?? create), ...update };
        return state.subscription;
      }),
      update: jest.fn().mockImplementation(async ({ data }) => {
        state.subscription = { ...(state.subscription as object), ...data };
        return state.subscription;
      }),
      updateMany: jest.fn().mockImplementation(async ({ data }) => {
        state.subscription = { ...(state.subscription as object), ...data };
        return { count: 1 };
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    plan: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { tier: string } }) =>
        ({
          ESSENCIAL: { id: "plan-ess", tier: "ESSENCIAL", name: "Essencial", priceCents: 4990, maxProfessionals: 2 },
          PROFISSIONAL: PLAN,
          PREMIUM: { id: "plan-prem", tier: "PREMIUM", name: "Premium", priceCents: 18990, maxProfessionals: null },
        })[where.tier] ?? null,
      ),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ email: "dono@salao.com" }) },
    coupon: tx.coupon,
    couponRedemption: tx.couponRedemption,
    billingAttempt: {
      findFirst: jest.fn().mockImplementation(async () => state.attempt),
      findFirstOrThrow: jest.fn().mockImplementation(async () => state.attempt),
      findUnique: tx.billingAttempt.findUnique,
      update: tx.billingAttempt.update,
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscription: {
      findUnique: tx.subscription.findUnique,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const mp = {
    isConfigured: jest.fn().mockReturnValue(world.configured ?? true),
    createPreapproval: jest.fn().mockResolvedValue({ id: "pre-1", init_point: "https://mp.test/checkout/pre-1" }),
    createPixPayment: jest.fn().mockResolvedValue({
      id: 987,
      point_of_interaction: { transaction_data: { qr_code: "000201...", qr_code_base64: "aGk=", ticket_url: "https://mp.test/t" } },
    }),
    getPayment: jest.fn(),
    getPreapproval: jest.fn(),
    getAuthorizedPayment: jest.fn(),
    cancelPreapproval: jest.fn().mockResolvedValue({}),
    updatePreapprovalAmount: jest.fn().mockResolvedValue({}),
  } as unknown as MercadoPagoClient & Record<string, jest.Mock>;

  const config = {
    get: (key: string) =>
      ({ FRONTEND_URL: "https://app.marquo.test", BACKEND_PUBLIC_URL: "https://api.marquo.test" })[key],
  } as unknown as ConfigService;
  const planLimit = { assertCanDowngrade: jest.fn().mockResolvedValue(undefined) } as unknown as PlanLimitService;

  const service = new PaymentsService(prisma, mp, config, new CouponsService(), planLimit);
  return { service, tx, prisma, mp, planLimit, state };
}

const percentCoupon = { id: "c-1", code: "PROMO20", kind: "PERCENT", value: 20, isActive: true, validFrom: null, validUntil: null, maxRedemptions: null, redemptionCount: 0 };

describe("PaymentsService.quote / cupom", () => {
  it("sem cupom: preço cheio", async () => {
    const { service } = build();
    const q = await service.quote(TENANT, "PROFISSIONAL" as never);
    expect(q).toMatchObject({ listPriceCents: 9990, discountCents: 0, chargeCents: 9990, coupon: null, couponError: null });
  });

  it("cupom percentual digitado reduz a primeira cobrança", async () => {
    const { service } = build({ coupon: percentCoupon });
    const q = await service.quote(TENANT, "PROFISSIONAL" as never, " promo20 ");
    expect(q).toMatchObject({ discountCents: 1998, chargeCents: 7992 });
    expect(q.coupon?.code).toBe("PROMO20");
  });

  it("usa sozinho o desconto resgatado no cadastro (sem digitar código)", async () => {
    const { service } = build({
      pendingRedemption: { id: "red-1", coupon: { id: "c-1", code: "PROMO20", kind: "PERCENT", value: 20 } },
    });
    const q = await service.quote(TENANT, "PROFISSIONAL" as never);
    expect(q.chargeCents).toBe(7992);
    expect(q.coupon?.fromSignup).toBe(true);
  });

  it.each([
    ["inexistente", null],
    ["desativado", { ...percentCoupon, isActive: false }],
    ["esgotado", { ...percentCoupon, maxRedemptions: 3, redemptionCount: 3 }],
    ["expirado", { ...percentCoupon, validUntil: new Date(Date.now() - 1000) }],
  ])("cupom %s não desconta e explica", async (_label, coupon) => {
    const { service } = build({ coupon });
    const q = await service.quote(TENANT, "PROFISSIONAL" as never, "PROMO20");
    expect(q.discountCents).toBe(0);
    expect(q.couponError).toBe("Cupom inválido ou expirado.");
  });

  it("cupom de dias de teste vale só no cadastro", async () => {
    const { service } = build({ coupon: { ...percentCoupon, kind: "TRIAL_DAYS", value: 30 } });
    const q = await service.quote(TENANT, "PROFISSIONAL" as never, "PROMO20");
    expect(q.discountCents).toBe(0);
    expect(q.couponError).toMatch(/só no cadastro/);
  });

  it("cupom que o negócio já usou é recusado", async () => {
    const { service } = build({ coupon: percentCoupon, existingRedemption: { id: "r", appliedAt: new Date() } });
    const q = await service.quote(TENANT, "PROFISSIONAL" as never, "PROMO20");
    expect(q.couponError).toMatch(/já usou/);
  });
});

describe("PaymentsService.startPix", () => {
  it("cria a tentativa com os valores do SERVIDOR e gera o Pix com o valor cobrado", async () => {
    const { service, tx, mp } = build({ coupon: percentCoupon });

    const result = await service.startPix(TENANT, USER, "PROFISSIONAL" as never, "promo20");

    const attempt = tx.billingAttempt.create.mock.calls[0][0].data;
    expect(attempt).toMatchObject({
      tenantId: TENANT,
      planId: "plan-pro",
      method: "PIX_MONTHLY",
      listPriceCents: 9990,
      discountCents: 1998,
      chargeCents: 7992,
      couponReserved: true,
    });
    expect(mp.createPixPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 7992,
        externalReference: ATTEMPT,
        payerEmail: "dono@salao.com",
        notificationUrl: "https://api.marquo.test/webhooks/mercadopago",
        idempotencyKey: ATTEMPT,
      }),
    );
    expect(result).toMatchObject({ attemptId: ATTEMPT, chargeCents: 7992, qrCode: "000201..." });
  });

  it("o desconto é uma reserva atômica de um uso do cupom (mesma regra do cadastro)", async () => {
    const { service, tx } = build({ coupon: percentCoupon });
    await service.startPix(TENANT, USER, "PROFISSIONAL" as never, "PROMO20");
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.couponRedemption.create).toHaveBeenCalledWith({
      data: { couponId: "c-1", tenantId: TENANT },
      select: { id: true },
    });
  });

  it("sem provedor configurado: 503, sem criar nada", async () => {
    const { service, tx } = build({ configured: false });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never)).rejects.toThrow(/ainda não está disponível/);
    expect(tx.billingAttempt.create).not.toHaveBeenCalled();
  });

  it("negócio suspenso não paga (o pagamento não desfaria a suspensão)", async () => {
    const { service, mp } = build({ suspendedAt: new Date() });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never)).rejects.toThrow(ForbiddenException);
    expect(mp.createPixPayment).not.toHaveBeenCalled();
  });

  it("checa se o plano comporta a equipe ativa antes de cobrar", async () => {
    const { service, planLimit, mp } = build();
    (planLimit.assertCanDowngrade as jest.Mock).mockRejectedValueOnce(new ConflictException("equipe grande"));
    await expect(service.startPix(TENANT, USER, "ESSENCIAL" as never)).rejects.toThrow("equipe grande");
    expect(mp.createPixPayment).not.toHaveBeenCalled();
  });

  it("falha do provedor: tentativa FAILED, uso do cupom devolvido e 502 genérico (sem vazar o erro)", async () => {
    const { service, tx, mp } = build({ coupon: percentCoupon });
    (mp.createPixPayment as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "segredo-interno"));
    // 1ª leitura (escolha do cupom): negócio ainda não usou; 2ª (devolução do uso): o resgate recém-criado.
    tx.couponRedemption.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "red-novo", couponId: "c-1", appliedAt: null });

    const attempt = service.startPix(TENANT, USER, "PROFISSIONAL" as never, "PROMO20");

    await expect(attempt).rejects.toBeInstanceOf(BadGatewayException);
    await expect(attempt).rejects.not.toThrow(/segredo-interno/);
    expect(tx.couponRedemption.delete).toHaveBeenCalled();
    const statusUpdates = tx.billingAttempt.update.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statusUpdates).toContain("FAILED");
  });

  it("cupom já usado por este negócio (corrida na unicidade): 409 e nada é cobrado", async () => {
    const { service, tx, mp } = build({ coupon: percentCoupon });
    const { Prisma } = jest.requireActual("@marquo/database");
    tx.couponRedemption.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, "PROMO20")).rejects.toThrow(ConflictException);
    expect(mp.createPixPayment).not.toHaveBeenCalled();
  });

  it("cupom inválido bloqueia a cobrança (400), sem criar tentativa", async () => {
    const { service, tx } = build({ coupon: null });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, "NAOEXISTE")).rejects.toThrow(BadRequestException);
    expect(tx.billingAttempt.create).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.startCard", () => {
  it("cria a assinatura no provedor com o valor da PRIMEIRA cobrança e devolve o link", async () => {
    const { service, mp } = build({ coupon: percentCoupon });
    const result = await service.startCard(TENANT, USER, "PROFISSIONAL" as never, "PROMO20");

    expect(mp.createPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 7992,
        externalReference: ATTEMPT,
        payerEmail: "dono@salao.com",
        backUrl: expect.stringContaining("https://app.marquo.test/dashboard/plano"),
      }),
    );
    expect(result).toMatchObject({ attemptId: ATTEMPT, url: "https://mp.test/checkout/pre-1" });
  });

  it("já tem cartão ativo: 409 (nada de cobrar em dobro)", async () => {
    const { service, mp } = build({
      subscription: {
        courtesy: false,
        method: "CARD_RECURRING",
        providerSubscriptionId: "pre-x",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(Date.now() + 5 * DAY),
      },
    });
    await expect(service.startCard(TENANT, USER, "PROFISSIONAL" as never)).rejects.toThrow(ConflictException);
    expect(mp.createPreapproval).not.toHaveBeenCalled();
  });

  it("quem está em cortesia pode assinar (pagar substitui a cortesia)", async () => {
    const { service, mp } = build({
      subscription: { courtesy: true, method: null, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 5 * DAY) },
    });
    await service.startCard(TENANT, USER, "PROFISSIONAL" as never);
    expect(mp.createPreapproval).toHaveBeenCalled();
  });
});

describe("PaymentsService: renovação do Pix", () => {
  it("Pix com o mês ainda longe de terminar: 409", async () => {
    const { service } = build({
      subscription: {
        courtesy: false,
        method: "PIX_MONTHLY",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 25 * DAY),
      },
    });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never)).rejects.toThrow(/ainda está longe/);
  });

  it("Pix perto do vencimento ou vencido: libera a próxima cobrança", async () => {
    const near = build({
      subscription: { courtesy: false, method: "PIX_MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 3 * DAY) },
    });
    await expect(near.service.startPix(TENANT, USER, "PROFISSIONAL" as never)).resolves.toBeDefined();

    const over = build({
      subscription: { courtesy: false, method: "PIX_MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() - DAY) },
    });
    await expect(over.service.startPix(TENANT, USER, "PROFISSIONAL" as never)).resolves.toBeDefined();
  });
});

describe("PaymentsService.syncAttempt (Pix)", () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: ATTEMPT,
    tenantId: TENANT,
    planId: "plan-pro",
    method: "PIX_MONTHLY",
    status: "PENDING",
    listPriceCents: 9990,
    discountCents: 0,
    chargeCents: 9990,
    couponRedemptionId: null,
    couponReserved: false,
    providerRef: "987",
    ...over,
  });
  const approved = (over: Record<string, unknown> = {}) => ({
    id: 987,
    status: "approved",
    external_reference: ATTEMPT,
    transaction_amount: 99.9,
    ...over,
  });

  it("pagamento aprovado ativa o plano por UM mês e marca a tentativa", async () => {
    const { service, tx, mp, state } = build({ attempt: pending() });
    (mp.getPayment as jest.Mock).mockResolvedValue(approved());

    const before = Date.now();
    await service.syncAttempt(ATTEMPT);

    expect(tx.subscription.upsert).toHaveBeenCalledTimes(1);
    const sub = state.subscription as Record<string, unknown>;
    expect(sub).toMatchObject({ planId: "plan-pro", status: "ACTIVE", courtesy: false, method: "PIX_MONTHLY", cancelAtPeriodEnd: false });
    const days = ((sub.currentPeriodEnd as Date).getTime() - before) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
  });

  // Idempotência: o provedor reentrega notificações, e o usuário também consulta. Pagar uma vez = um mês.
  it("aplicar duas vezes o mesmo pagamento NÃO soma dois meses", async () => {
    const { service, tx, mp } = build({ attempt: pending() });
    (mp.getPayment as jest.Mock).mockResolvedValue(approved());

    await service.syncAttempt(ATTEMPT);
    await service.syncAttempt(ATTEMPT);

    expect(tx.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  it("renovação antecipada soma a partir do fim atual (não perde os dias que sobravam)", async () => {
    const end = new Date(Date.now() + 5 * DAY);
    const { service, mp, state } = build({
      attempt: pending(),
      subscription: { courtesy: false, method: "PIX_MONTHLY", status: "ACTIVE", currentPeriodEnd: end },
    });
    (mp.getPayment as jest.Mock).mockResolvedValue(approved());

    await service.syncAttempt(ATTEMPT);

    const next = (state.subscription as { currentPeriodEnd: Date }).currentPeriodEnd.getTime();
    expect(next).toBeGreaterThan(end.getTime() + 27 * DAY);
  });

  // Defesa: um pagamento de OUTRA referência ou de valor diferente não ativa nada.
  it.each([
    ["referência de outra tentativa", approved({ external_reference: "44444444-4444-4444-8444-444444444444" })],
    ["id de outro pagamento", approved({ id: 111 })],
    ["valor menor que o cobrado", approved({ transaction_amount: 1 })],
  ])("ignora pagamento com %s", async (_label, payment) => {
    const { service, tx, mp } = build({ attempt: pending() });
    (mp.getPayment as jest.Mock).mockResolvedValue(payment);

    await service.syncAttempt(ATTEMPT);

    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("pagamento recusado/cancelado: tentativa FAILED e o uso do cupom volta", async () => {
    const { service, tx, mp, state } = build({
      attempt: pending({ couponRedemptionId: "red-1", couponReserved: true }),
    });
    tx.couponRedemption.findUnique.mockResolvedValue({ id: "red-1", couponId: "c-1", appliedAt: null });
    (mp.getPayment as jest.Mock).mockResolvedValue(approved({ status: "rejected" }));

    await service.syncAttempt(ATTEMPT);

    expect((state.attempt as Record<string, unknown>).status).toBe("FAILED");
    expect(tx.couponRedemption.delete).toHaveBeenCalledWith({ where: { id: "red-1" } });
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("aprovado com cupom: marca o desconto como abatido", async () => {
    const { service, tx, mp } = build({ attempt: pending({ couponRedemptionId: "red-1", chargeCents: 7992, discountCents: 1998 }) });
    (mp.getPayment as jest.Mock).mockResolvedValue(approved({ transaction_amount: 79.92 }));

    await service.syncAttempt(ATTEMPT);

    expect(tx.couponRedemption.updateMany).toHaveBeenCalledWith({
      where: { id: "red-1", appliedAt: null },
      data: { appliedAt: expect.any(Date) },
    });
  });

  it("migrando de cartão para Pix: encerra a recorrência antiga", async () => {
    const { service, mp } = build({
      attempt: pending(),
      subscription: {
        courtesy: false,
        method: "CARD_RECURRING",
        providerSubscriptionId: "pre-antiga",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 3 * DAY),
      },
    });
    (mp.getPayment as jest.Mock).mockResolvedValue(approved());

    await service.syncAttempt(ATTEMPT);

    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre-antiga");
  });
});

describe("PaymentsService.syncAttempt (cartão)", () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: ATTEMPT,
    tenantId: TENANT,
    planId: "plan-pro",
    method: "CARD_RECURRING",
    status: "PENDING",
    listPriceCents: 9990,
    discountCents: 0,
    chargeCents: 9990,
    couponRedemptionId: null,
    couponReserved: false,
    providerRef: "pre-1",
    ...over,
  });
  const pre = (over: Record<string, unknown> = {}) => ({
    id: "pre-1",
    status: "authorized",
    external_reference: ATTEMPT,
    next_payment_date: new Date(Date.now() + 30 * DAY).toISOString(),
    auto_recurring: { transaction_amount: 99.9 },
    summarized: { charged_quantity: 1 },
    ...over,
  });

  it("autorizada: ativa o plano, guarda o id da assinatura e o próximo vencimento", async () => {
    const { service, mp, state } = build({ attempt: pending() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(pre());

    await service.syncAttempt(ATTEMPT);

    expect(state.subscription).toMatchObject({
      status: "ACTIVE",
      method: "CARD_RECURRING",
      providerSubscriptionId: "pre-1",
      courtesy: false,
    });
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
  });

  it("pendente (ainda no checkout): não muda nada", async () => {
    const { service, tx, mp } = build({ attempt: pending() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(pre({ status: "pending" }));
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("referência que não bate com a tentativa é ignorada", async () => {
    const { service, tx, mp } = build({ attempt: pending() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(pre({ external_reference: "44444444-4444-4444-8444-444444444444" }));
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("pausada: em atraso (PAST_DUE), mantendo a assinatura", async () => {
    const { service, mp, state } = build({
      attempt: pending({ status: "APPROVED" }),
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "pre-1", status: "ACTIVE", currentPeriodEnd: new Date() },
    });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(pre({ status: "paused" }));
    await service.syncAttempt(ATTEMPT);
    expect((state.subscription as Record<string, unknown>).status).toBe("PAST_DUE");
  });

  it("cancelada pelo provedor: o que foi pago vale até o fim do período", async () => {
    const { service, mp, state } = build({
      attempt: pending({ status: "APPROVED" }),
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "pre-1", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 10 * DAY) },
    });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(pre({ status: "cancelled" }));
    await service.syncAttempt(ATTEMPT);
    expect((state.subscription as Record<string, unknown>).cancelAtPeriodEnd).toBe(true);
  });

  it("desistiu no checkout (cancelada sem nunca autorizar): tentativa FAILED e cupom devolvido", async () => {
    const { service, tx, mp, state } = build({
      attempt: pending({ couponRedemptionId: "red-1", couponReserved: true }),
    });
    tx.couponRedemption.findUnique.mockResolvedValue({ id: "red-1", couponId: "c-1", appliedAt: null });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(pre({ status: "cancelled" }));
    await service.syncAttempt(ATTEMPT);
    expect((state.attempt as Record<string, unknown>).status).toBe("FAILED");
    expect(tx.couponRedemption.delete).toHaveBeenCalled();
  });

  it("com desconto na 1ª cobrança, depois que ela saiu volta ao preço cheio", async () => {
    const { service, mp } = build({ attempt: pending({ discountCents: 1998, chargeCents: 7992 }) });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(
      pre({ auto_recurring: { transaction_amount: 79.92 }, summarized: { charged_quantity: 1 } }),
    );
    await service.syncAttempt(ATTEMPT);
    expect(mp.updatePreapprovalAmount).toHaveBeenCalledWith("pre-1", 9990);
  });

  // Se ainda não houve cobrança, restaurar já faria a 1ª sair cheia (o cliente pagaria mais do que viu).
  it("antes da 1ª cobrança NÃO restaura o preço", async () => {
    const { service, mp } = build({ attempt: pending({ discountCents: 1998, chargeCents: 7992 }) });
    (mp.getPreapproval as jest.Mock).mockResolvedValue(
      pre({ auto_recurring: { transaction_amount: 79.92 }, summarized: { charged_quantity: 0 } }),
    );
    await service.syncAttempt(ATTEMPT);
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.getAttempt (posse)", () => {
  it("busca com tenantId no WHERE: tentativa de outro negócio é 404", async () => {
    const { service, prisma } = build();
    (prisma.billingAttempt.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.getAttempt(TENANT, ATTEMPT)).rejects.toThrow(/não encontrada/);
    expect(prisma.billingAttempt.findFirst).toHaveBeenCalledWith({ where: { id: ATTEMPT, tenantId: TENANT } });
  });

  it("id que não é UUID: 404 sem tocar no banco", async () => {
    const { service, prisma } = build();
    await expect(service.getAttempt(TENANT, "../../x")).rejects.toThrow(/não encontrada/);
    expect(prisma.billingAttempt.findFirst).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.handleNotification", () => {
  it("o corpo é só um aviso: relê o pagamento no provedor e aplica pelo external_reference", async () => {
    const attempt = {
      id: ATTEMPT,
      tenantId: TENANT,
      planId: "plan-pro",
      method: "PIX_MONTHLY",
      status: "PENDING",
      listPriceCents: 9990,
      discountCents: 0,
      chargeCents: 9990,
      couponRedemptionId: null,
      couponReserved: false,
      providerRef: "987",
    };
    const { service, mp, state } = build({ attempt });
    (mp.getPayment as jest.Mock).mockResolvedValue({
      id: 987,
      status: "approved",
      external_reference: ATTEMPT,
      transaction_amount: 99.9,
    });

    await service.handleNotification("payment", "987");

    expect(mp.getPayment).toHaveBeenCalledWith("987");
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
  });

  it("referência que não é um id nosso (UUID) é ignorada", async () => {
    const { service, mp, tx } = build();
    (mp.getPayment as jest.Mock).mockResolvedValue({ id: 1, status: "approved", external_reference: "alguma-coisa" });
    await service.handleNotification("payment", "1");
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("tipo desconhecido e id gigante são ignorados sem chamar o provedor", async () => {
    const { service, mp } = build();
    await service.handleNotification("plan", "123");
    await service.handleNotification("payment", "9".repeat(80));
    expect(mp.getPayment).not.toHaveBeenCalled();
    expect(mp.getPreapproval).not.toHaveBeenCalled();
  });

  it("provedor não conhece o id (404): ignora com 200, sem estourar (não há o que reentregar)", async () => {
    const { service, mp } = build();
    (mp.getPayment as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(404, "not found"));
    await expect(service.handleNotification("payment", "999")).resolves.toBeUndefined();
  });

  it("falha do provedor (5xx/rede): 503, para o provedor reentregar depois", async () => {
    const { service, mp } = build();
    (mp.getPayment as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "boom"));
    await expect(service.handleNotification("payment", "999")).rejects.toThrow(/indisponível/);
  });

  it("sem provedor configurado: não faz nada", async () => {
    const { service, mp } = build({ configured: false });
    await service.handleNotification("payment", "1");
    expect(mp.getPayment).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.cancel", () => {
  it("cartão: cancela a recorrência no provedor e mantém o acesso até o fim do período", async () => {
    const { service, mp, prisma } = build({
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "pre-1", status: "ACTIVE", cancelAtPeriodEnd: false },
    });
    await service.cancel(TENANT);
    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre-1");
    expect((prisma.subscription as unknown as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, courtesy: false },
      data: { cancelAtPeriodEnd: true },
    });
  });

  it("Pix: não há recorrência a cancelar, só marca o fim no período", async () => {
    const { service, mp } = build({
      subscription: { courtesy: false, method: "PIX_MONTHLY", providerSubscriptionId: null, status: "ACTIVE", cancelAtPeriodEnd: false },
    });
    await service.cancel(TENANT);
    expect(mp.cancelPreapproval).not.toHaveBeenCalled();
  });

  it("cortesia não é cancelada por aqui (409)", async () => {
    const { service } = build({ subscription: { courtesy: true } });
    await expect(service.cancel(TENANT)).rejects.toThrow(ConflictException);
  });

  it("falha do provedor ao cancelar: 502 e NADA é marcado (não finge que cancelou)", async () => {
    const { service, mp, prisma } = build({
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "pre-1", status: "ACTIVE", cancelAtPeriodEnd: false },
    });
    (mp.cancelPreapproval as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "x"));
    await expect(service.cancel(TENANT)).rejects.toBeInstanceOf(BadGatewayException);
    expect((prisma.subscription as unknown as { updateMany: jest.Mock }).updateMany).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.changePlan", () => {
  const paidCard = (over: Record<string, unknown> = {}) => ({
    tenantId: TENANT,
    planId: "plan-pro",
    courtesy: false,
    method: "CARD_RECURRING",
    providerSubscriptionId: "pre-1",
    status: "ACTIVE",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(Date.now() + 15 * DAY),
    ...over,
  });
  const paidPix = (over: Record<string, unknown> = {}) =>
    paidCard({ method: "PIX_MONTHLY", providerSubscriptionId: null, ...over });

  it("upgrade no cartão: atualiza o valor da recorrência no provedor e grava o plano", async () => {
    const { service, mp, state } = build({ subscription: paidCard() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue({ id: "pre-1", summarized: { charged_quantity: 1 } });

    const result = await service.changePlan(TENANT, "PREMIUM" as never);

    expect(mp.updatePreapprovalAmount).toHaveBeenCalledWith("pre-1", 18990);
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-prem");
    expect(result.effective).toMatch(/próxima cobrança/);
  });

  // O requisito: não dá para rebaixar para um plano que não comporta a equipe que o negócio tem.
  it("downgrade com equipe MAIOR que o plano novo é recusado e nada muda", async () => {
    const { service, mp, planLimit, state } = build({ subscription: paidCard() });
    (planLimit.assertCanDowngrade as jest.Mock).mockRejectedValueOnce(
      new ConflictException("Você tem 4 profissionais ativos, mas o plano Essencial permite no máximo 2."),
    );

    await expect(service.changePlan(TENANT, "ESSENCIAL" as never)).rejects.toThrow(/4 profissionais ativos/);

    expect(planLimit.assertCanDowngrade).toHaveBeenCalledWith(TENANT, "ESSENCIAL");
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-pro");
  });

  it("downgrade que a equipe comporta é permitido", async () => {
    const { service, mp, state } = build({ subscription: paidCard() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue({ id: "pre-1", summarized: { charged_quantity: 3 } });
    await service.changePlan(TENANT, "ESSENCIAL" as never);
    expect(mp.updatePreapprovalAmount).toHaveBeenCalledWith("pre-1", 4990);
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-ess");
  });

  it("Pix: troca o plano sem falar com o provedor; o valor novo vale no próximo Pix", async () => {
    const { service, mp, state } = build({ subscription: paidPix() });
    const result = await service.changePlan(TENANT, "PREMIUM" as never);
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-prem");
    expect(result.effective).toMatch(/próximo Pix/);
  });

  it("falha do provedor ao trocar: 502 e o plano NÃO muda (não finge que trocou)", async () => {
    const { service, mp, state } = build({ subscription: paidCard() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue({ id: "pre-1", summarized: { charged_quantity: 1 } });
    (mp.updatePreapprovalAmount as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "x"));
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toBeInstanceOf(BadGatewayException);
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-pro");
  });

  it("antes da 1ª cobrança (valor ainda com o cupom) não troca", async () => {
    const { service, mp } = build({ subscription: paidCard() });
    (mp.getPreapproval as jest.Mock).mockResolvedValue({ id: "pre-1", summarized: { charged_quantity: 0 } });
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toThrow(/primeira cobrança/);
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
  });

  it.each([
    ["sem assinatura", null, /assinatura paga/],
    ["cortesia (quem muda é a plataforma)", { courtesy: true, method: null, status: "ACTIVE" }, /assinatura paga/],
    ["cancelada", paidCard({ cancelAtPeriodEnd: true }), /cancelada/],
    ["em atraso", paidCard({ status: "PAST_DUE" }), /Regularize/],
    ["mesmo plano", paidCard({ planId: "plan-prem" }), /já é o seu plano/],
    ["Pix com o mês vencido", paidPix({ currentPeriodEnd: new Date(Date.now() - DAY) }), /próximo mês/],
  ])("recusa a troca: %s", async (_label, subscription, message) => {
    const { service, mp } = build({ subscription: subscription as Record<string, unknown> | null });
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toThrow(message as RegExp);
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
  });

  it("duas trocas simultâneas: a que perde a corrida (plano antigo no WHERE) recebe 409", async () => {
    const { service, tx } = build({ subscription: paidPix() });
    tx.subscription.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toThrow(/mudou enquanto/);
    expect(tx.subscription.updateMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, planId: "plan-pro", courtesy: false });
  });
});

// Regressão: depois de trocar de plano, a releitura da assinatura (webhook, tela, tarefa horária) usava o plano da
// tentativa ORIGINAL e desfazia a troca, além de "restaurar" o valor antigo no provedor.
describe("PaymentsService: releitura do cartão depois de trocar de plano", () => {
  it("não regrava o plano da assinatura com o da tentativa original nem restaura o valor antigo", async () => {
    const attempt = {
      id: ATTEMPT,
      tenantId: TENANT,
      planId: "plan-pro",
      method: "CARD_RECURRING",
      status: "APPROVED",
      listPriceCents: 9990,
      discountCents: 1998,
      chargeCents: 7992,
      couponRedemptionId: null,
      couponReserved: false,
      providerRef: "pre-1",
    };
    const { service, mp, state } = build({
      attempt,
      subscription: {
        tenantId: TENANT,
        planId: "plan-prem",
        courtesy: false,
        method: "CARD_RECURRING",
        providerSubscriptionId: "pre-1",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 10 * DAY),
      },
    });
    (mp.getPreapproval as jest.Mock).mockResolvedValue({
      id: "pre-1",
      status: "authorized",
      external_reference: ATTEMPT,
      next_payment_date: new Date(Date.now() + 30 * DAY).toISOString(),
      auto_recurring: { transaction_amount: 189.9 },
      summarized: { charged_quantity: 2 },
    });

    await service.syncAttempt(ATTEMPT);

    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-prem");
    expect(mp.updatePreapprovalAmount).not.toHaveBeenCalled();
  });
});

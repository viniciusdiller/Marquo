import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CouponsService } from "../../coupons/coupons.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PlanLimitService } from "../plan-limit.service";
import { AsaasClient, PaymentProviderError } from "./asaas.client";
import { asaasDate } from "./pricing";
import { PaymentsService } from "./payments.service";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "33333333-3333-4333-8333-333333333333";
const DAY = 86_400_000;
// CPF válido (com máscara, como o formulário envia) e o mesmo em dígitos (como segue para o provedor).
const CPF = "529.982.247-25";
const CPF_DIGITS = "52998224725";
const CNPJ = "11.222.333/0001-81";

const PLAN = { id: "plan-pro", tier: "PROFISSIONAL", name: "Profissional", priceCents: 9990, maxProfessionals: 5 };

interface World {
  subscription?: Record<string, unknown> | null;
  suspendedAt?: Date | null;
  attempt?: Record<string, unknown> | null;
  coupon?: Record<string, unknown> | null;
  pendingRedemption?: Record<string, unknown> | null;
  existingRedemption?: Record<string, unknown> | null;
  configured?: boolean;
  env?: Record<string, string>;
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
    user: { findFirst: jest.fn().mockResolvedValue({ name: "Dono do Salão", email: "dono@salao.com" }) },
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

  const asaas = {
    isConfigured: jest.fn().mockReturnValue(world.configured ?? true),
    createCustomer: jest.fn().mockResolvedValue({ id: "cus_1" }),
    createPixPayment: jest.fn().mockResolvedValue({ id: "pay_1" }),
    getPixQrCode: jest.fn().mockResolvedValue({ payload: "000201...", encodedImage: "aGk=" }),
    getPayment: jest.fn(),
    deletePayment: jest.fn().mockResolvedValue(undefined),
    createCheckout: jest.fn().mockResolvedValue({ id: "chk_1" }),
    checkoutUrl: jest.fn().mockImplementation((c: { id: string }) => `https://asaas.test/checkout?id=${c.id}`),
    listSubscriptionsByCustomer: jest.fn().mockResolvedValue([]),
    getSubscription: jest.fn(),
    listSubscriptionPayments: jest.fn().mockResolvedValue([]),
    updateSubscriptionValue: jest.fn().mockResolvedValue({}),
    deleteSubscription: jest.fn().mockResolvedValue(undefined),
  } as Record<string, jest.Mock>;

  const config = {
    get: (key: string) =>
      ({ FRONTEND_URL: "https://app.marquo.test", ...world.env })[key],
  } as unknown as ConfigService;
  const planLimit = { assertCanDowngrade: jest.fn().mockResolvedValue(undefined) } as unknown as PlanLimitService;

  const service = new PaymentsService(prisma, asaas as unknown as AsaasClient, config, new CouponsService(), planLimit);
  return { service, tx, prisma, asaas, planLimit, state };
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
    const { service, tx, asaas } = build({ coupon: percentCoupon });

    const result = await service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF, "promo20");

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
    expect(asaas.createPixPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_1",
        amountCents: 7992,
        externalReference: ATTEMPT,
        dueDate: asaasDate(new Date()),
      }),
    );
    expect(result).toMatchObject({ attemptId: ATTEMPT, chargeCents: 7992, qrCode: "000201...", qrCodeBase64: "aGk=" });
  });

  it("o cliente do Asaas nasce com os dados do dono LIDOS DO BANCO e o documento só em dígitos", async () => {
    const { service, prisma, asaas } = build();
    await service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF);

    // Dono relido com o tenant no WHERE (nome e e-mail nunca vêm do request).
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER, tenantId: TENANT } }));
    expect(asaas.createCustomer).toHaveBeenCalledWith({
      name: "Dono do Salão",
      email: "dono@salao.com",
      cpfCnpj: CPF_DIGITS,
      externalReference: ATTEMPT,
    });
  });

  it("guarda o id do cliente e da cobrança na tentativa, e NUNCA o documento", async () => {
    const { service, tx } = build();
    await service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF);

    const writes = tx.billingAttempt.update.mock.calls.map((c) => c[0].data);
    expect(writes).toEqual(expect.arrayContaining([{ providerCustomerId: "cus_1" }, { providerRef: "pay_1" }]));
    expect(JSON.stringify([writes, tx.billingAttempt.create.mock.calls])).not.toContain(CPF_DIGITS);
  });

  it("aceita CNPJ (MEI/empresa)", async () => {
    const { service, asaas } = build();
    await service.startPix(TENANT, USER, "PROFISSIONAL" as never, CNPJ);
    expect(asaas.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ cpfCnpj: "11222333000181" }));
  });

  it.each([["CPF com dígito errado", "529.982.247-26"], ["lixo", "abc"], ["vazio", ""], ["sequência repetida", "111.111.111-11"]])(
    "documento inválido (%s): 400 e nada é criado, nem tentativa nem cliente",
    async (_label, document) => {
      const { service, tx, asaas } = build();
      await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, document)).rejects.toThrow(BadRequestException);
      expect(tx.billingAttempt.create).not.toHaveBeenCalled();
      expect(asaas.createCustomer).not.toHaveBeenCalled();
    },
  );

  it("o desconto é uma reserva atômica de um uso do cupom (mesma regra do cadastro)", async () => {
    const { service, tx } = build({ coupon: percentCoupon });
    await service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF, "PROMO20");
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.couponRedemption.create).toHaveBeenCalledWith({
      data: { couponId: "c-1", tenantId: TENANT },
      select: { id: true },
    });
  });

  it("sem provedor configurado: 503, sem criar nada", async () => {
    const { service, tx } = build({ configured: false });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).rejects.toThrow(/ainda não está disponível/);
    expect(tx.billingAttempt.create).not.toHaveBeenCalled();
  });

  it("negócio suspenso não paga (o pagamento não desfaria a suspensão)", async () => {
    const { service, asaas } = build({ suspendedAt: new Date() });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).rejects.toThrow(ForbiddenException);
    expect(asaas.createPixPayment).not.toHaveBeenCalled();
  });

  it("checa se o plano comporta a equipe ativa antes de cobrar", async () => {
    const { service, planLimit, asaas } = build();
    (planLimit.assertCanDowngrade as jest.Mock).mockRejectedValueOnce(new ConflictException("equipe grande"));
    await expect(service.startPix(TENANT, USER, "ESSENCIAL" as never, CPF)).rejects.toThrow("equipe grande");
    expect(asaas.createPixPayment).not.toHaveBeenCalled();
  });

  it("falha do provedor: tentativa FAILED, uso do cupom devolvido e 502 genérico (sem vazar o erro)", async () => {
    const { service, tx, asaas } = build({ coupon: percentCoupon });
    (asaas.createPixPayment as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "segredo-interno"));
    // 1ª leitura (escolha do cupom): negócio ainda não usou; 2ª (devolução do uso): o resgate recém-criado.
    tx.couponRedemption.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "red-novo", couponId: "c-1", appliedAt: null });

    const attempt = service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF, "PROMO20");

    await expect(attempt).rejects.toBeInstanceOf(BadGatewayException);
    await expect(attempt).rejects.not.toThrow(/segredo-interno/);
    expect(tx.couponRedemption.delete).toHaveBeenCalled();
    const statusUpdates = tx.billingAttempt.update.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statusUpdates).toContain("FAILED");
  });

  it("cobrança criada mas QR Code indisponível: tentativa FAILED e a cobrança é removida no provedor", async () => {
    const { service, asaas, tx } = build();
    (asaas.getPixQrCode as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "x"));

    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).rejects.toBeInstanceOf(BadGatewayException);

    expect(asaas.deletePayment).toHaveBeenCalledWith("pay_1");
    expect(tx.billingAttempt.update.mock.calls.map((c) => c[0].data.status)).toContain("FAILED");
  });

  it("cupom já usado por este negócio (corrida na unicidade): 409 e nada é cobrado", async () => {
    const { service, tx, asaas } = build({ coupon: percentCoupon });
    const { Prisma } = jest.requireActual("@marquo/database");
    tx.couponRedemption.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF, "PROMO20")).rejects.toThrow(ConflictException);
    expect(asaas.createPixPayment).not.toHaveBeenCalled();
  });

  it("cupom inválido bloqueia a cobrança (400), sem criar tentativa", async () => {
    const { service, tx } = build({ coupon: null });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF, "NAOEXISTE")).rejects.toThrow(BadRequestException);
    expect(tx.billingAttempt.create).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.startCard", () => {
  it("monta o checkout hospedado com o valor da PRIMEIRA cobrança e devolve o link", async () => {
    const { service, asaas } = build({ coupon: percentCoupon });
    const result = await service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF, "PROMO20");

    expect(asaas.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfCnpj: CPF_DIGITS, externalReference: ATTEMPT, email: "dono@salao.com" }),
    );
    expect(asaas.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_1",
        amountCents: 7992,
        successUrl: `https://app.marquo.test/dashboard/plano?checkout=cartao&tentativa=${ATTEMPT}`,
        cancelUrl: "https://app.marquo.test/dashboard/plano",
        expiredUrl: "https://app.marquo.test/dashboard/plano",
        minutesToExpire: 1440,
        nextDueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2} 23:59:59$/),
      }),
    );
    expect(result).toEqual({ attemptId: ATTEMPT, url: "https://asaas.test/checkout?id=chk_1", chargeCents: 7992 });
  });

  it("o cartão nunca passa por aqui: nada de dado de cartão na chamada ao provedor", async () => {
    const { service, asaas } = build();
    await service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF);
    const payload = JSON.stringify((asaas.createCheckout as jest.Mock).mock.calls[0][0]);
    expect(payload).not.toMatch(/creditCard|ccv|cardNumber|holderName/i);
  });

  it("amarra a tentativa ao checkout e ao cliente do provedor", async () => {
    const { service, state } = build();
    await service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF);
    expect(state.attempt).toMatchObject({ providerRef: "chk_1", providerCustomerId: "cus_1", method: "CARD_RECURRING" });
  });

  it("FRONTEND_URL define a base de volta (sem barra dupla)", async () => {
    const { service, asaas } = build({ env: { FRONTEND_URL: "https://marquo.com.br/" } });
    await service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF);
    expect((asaas.createCheckout as jest.Mock).mock.calls[0][0].successUrl).toMatch(/^https:\/\/marquo\.com\.br\/dashboard\/plano\?/);
  });

  // O Asaas recusa http/localhost nas URLs de retorno ("O campo successUrl é inválido"): em dev a base vem de um túnel https.
  it("ASAAS_BACK_URL_BASE (https) vira a base de volta sem mexer no FRONTEND_URL", async () => {
    const { service, asaas } = build({
      env: { FRONTEND_URL: "http://localhost:3000", ASAAS_BACK_URL_BASE: "https://abc123.ngrok-free.app/" },
    });
    await service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF);
    const call = (asaas.createCheckout as jest.Mock).mock.calls[0][0];
    expect(call.successUrl).toBe(`https://abc123.ngrok-free.app/dashboard/plano?checkout=cartao&tentativa=${ATTEMPT}`);
    expect(call.cancelUrl).toBe("https://abc123.ngrok-free.app/dashboard/plano");
    expect(call.expiredUrl).toBe("https://abc123.ngrok-free.app/dashboard/plano");
  });

  it("sem endereço https de retorno (localhost sem túnel): 503 com o motivo, e NADA é criado nem enviado ao provedor", async () => {
    const { service, tx, asaas } = build({ env: { FRONTEND_URL: "http://localhost:3000" } });
    await expect(service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF)).rejects.toThrow(/ASAAS_BACK_URL_BASE/);
    expect(tx.billingAttempt.create).not.toHaveBeenCalled();
    expect(asaas.createCustomer).not.toHaveBeenCalled();
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it("o Pix não depende de URL de retorno: funciona em localhost", async () => {
    const { service, asaas } = build({ env: { FRONTEND_URL: "http://localhost:3000" } });
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).resolves.toBeDefined();
    expect(asaas.createPixPayment).toHaveBeenCalled();
  });

  it("documento inválido: 400 e nada é criado", async () => {
    const { service, tx, asaas } = build();
    await expect(service.startCard(TENANT, USER, "PROFISSIONAL" as never, "123")).rejects.toThrow(BadRequestException);
    expect(tx.billingAttempt.create).not.toHaveBeenCalled();
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it("falha do provedor: tentativa FAILED, 502 genérico", async () => {
    const { service, asaas, tx } = build();
    (asaas.createCheckout as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(400, "segredo-interno"));
    const attempt = service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF);
    await expect(attempt).rejects.toBeInstanceOf(BadGatewayException);
    await expect(attempt).rejects.not.toThrow(/segredo-interno/);
    expect(tx.billingAttempt.update.mock.calls.map((c) => c[0].data.status)).toContain("FAILED");
  });

  it("já tem cartão ativo: 409 (nada de cobrar em dobro)", async () => {
    const { service, asaas } = build({
      subscription: {
        courtesy: false,
        method: "CARD_RECURRING",
        providerSubscriptionId: "sub_x",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(Date.now() + 5 * DAY),
      },
    });
    await expect(service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF)).rejects.toThrow(ConflictException);
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });

  it("quem está em cortesia pode assinar (pagar substitui a cortesia)", async () => {
    const { service, asaas } = build({
      subscription: { courtesy: true, method: null, status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 5 * DAY) },
    });
    await service.startCard(TENANT, USER, "PROFISSIONAL" as never, CPF);
    expect(asaas.createCheckout).toHaveBeenCalled();
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
    await expect(service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).rejects.toThrow(/ainda está longe/);
  });

  it("Pix perto do vencimento ou vencido: libera a próxima cobrança", async () => {
    const near = build({
      subscription: { courtesy: false, method: "PIX_MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 3 * DAY) },
    });
    await expect(near.service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).resolves.toBeDefined();

    const over = build({
      subscription: { courtesy: false, method: "PIX_MONTHLY", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() - DAY) },
    });
    await expect(over.service.startPix(TENANT, USER, "PROFISSIONAL" as never, CPF)).resolves.toBeDefined();
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
    providerRef: "pay_1",
    providerCustomerId: "cus_1",
    ...over,
  });
  const received = (over: Record<string, unknown> = {}) => ({
    id: "pay_1",
    status: "RECEIVED",
    externalReference: ATTEMPT,
    value: 99.9,
    ...over,
  });

  it("Pix recebido ativa o plano por UM mês e marca a tentativa", async () => {
    const { service, tx, asaas, state } = build({ attempt: pending() });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received());

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

  it("CONFIRMED também conta como pago", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received({ status: "CONFIRMED" }));
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  // Idempotência: o provedor reentrega notificações, e o usuário também consulta. Pagar uma vez = um mês.
  it("aplicar duas vezes o mesmo pagamento NÃO soma dois meses", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received());

    await service.syncAttempt(ATTEMPT);
    await service.syncAttempt(ATTEMPT);

    expect(tx.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  it("renovação antecipada soma a partir do fim atual (não perde os dias que sobravam)", async () => {
    const end = new Date(Date.now() + 5 * DAY);
    const { service, asaas, state } = build({
      attempt: pending(),
      subscription: { courtesy: false, method: "PIX_MONTHLY", status: "ACTIVE", currentPeriodEnd: end },
    });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received());

    await service.syncAttempt(ATTEMPT);

    const next = (state.subscription as { currentPeriodEnd: Date }).currentPeriodEnd.getTime();
    expect(next).toBeGreaterThan(end.getTime() + 27 * DAY);
  });

  // Defesa: uma cobrança de OUTRA referência, de valor diferente ou ainda não paga não ativa nada.
  it.each([
    ["referência de outra tentativa", received({ externalReference: "44444444-4444-4444-8444-444444444444" })],
    ["sem referência", received({ externalReference: null })],
    ["id de outra cobrança", received({ id: "pay_outra" })],
    ["valor menor que o cobrado", received({ value: 1 })],
    ["valor ausente", received({ value: undefined })],
    ["ainda pendente", received({ status: "PENDING" })],
    ["vencida sem pagamento", received({ status: "OVERDUE" })],
    // "Recebida em dinheiro" é marcação manual de quem opera a conta: o pagador não a produz, então não credita acesso.
    ["recebida em dinheiro (marcação manual)", received({ status: "RECEIVED_IN_CASH" })],
  ])("ignora cobrança com %s", async (_label, payment) => {
    const { service, tx, asaas, state } = build({ attempt: pending() });
    (asaas.getPayment as jest.Mock).mockResolvedValue(payment);

    await service.syncAttempt(ATTEMPT);

    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect((state.attempt as Record<string, unknown>).status).toBe("PENDING");
  });

  it.each([
    ["estornada", received({ status: "REFUNDED" })],
    ["contestada (chargeback)", received({ status: "CHARGEBACK_REQUESTED" })],
    ["removida no provedor", received({ status: "PENDING", deleted: true })],
  ])("cobrança %s: tentativa FAILED e o uso do cupom volta", async (_label, payment) => {
    const { service, tx, asaas, state } = build({
      attempt: pending({ couponRedemptionId: "red-1", couponReserved: true }),
    });
    tx.couponRedemption.findUnique.mockResolvedValue({ id: "red-1", couponId: "c-1", appliedAt: null });
    (asaas.getPayment as jest.Mock).mockResolvedValue(payment);

    await service.syncAttempt(ATTEMPT);

    expect((state.attempt as Record<string, unknown>).status).toBe("FAILED");
    expect(tx.couponRedemption.delete).toHaveBeenCalledWith({ where: { id: "red-1" } });
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("recebido com cupom: marca o desconto como abatido", async () => {
    const { service, tx, asaas } = build({ attempt: pending({ couponRedemptionId: "red-1", chargeCents: 7992, discountCents: 1998 }) });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received({ value: 79.92 }));

    await service.syncAttempt(ATTEMPT);

    expect(tx.couponRedemption.updateMany).toHaveBeenCalledWith({
      where: { id: "red-1", appliedAt: null },
      data: { appliedAt: expect.any(Date) },
    });
  });

  it("migrando de cartão para Pix: encerra a recorrência antiga", async () => {
    const { service, asaas } = build({
      attempt: pending(),
      subscription: {
        courtesy: false,
        method: "CARD_RECURRING",
        providerSubscriptionId: "sub_antiga",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 3 * DAY),
      },
    });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received());

    await service.syncAttempt(ATTEMPT);

    expect(asaas.deleteSubscription).toHaveBeenCalledWith("sub_antiga");
  });

  it("falha ao encerrar a recorrência antiga não desfaz o pagamento (fica no log)", async () => {
    const { service, asaas, state } = build({
      attempt: pending(),
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "sub_antiga", status: "ACTIVE", currentPeriodEnd: new Date() },
    });
    (asaas.getPayment as jest.Mock).mockResolvedValue(received());
    (asaas.deleteSubscription as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "x"));

    await expect(service.syncAttempt(ATTEMPT)).resolves.toBeUndefined();
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
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
    providerRef: "chk_1",
    providerCustomerId: "cus_1",
    ...over,
  });
  const subscription = (over: Record<string, unknown> = {}) => ({
    id: "sub_1",
    status: "ACTIVE",
    customer: "cus_1",
    value: 99.9,
    deleted: false,
    ...over,
  });
  const charge = (over: Record<string, unknown> = {}) => ({
    id: "pay_a",
    status: "CONFIRMED",
    value: 99.9,
    dueDate: asaasDate(new Date()),
    ...over,
  });
  const provider = (asaas: Record<string, jest.Mock>, sub: Record<string, unknown>, payments: Record<string, unknown>[]) => {
    asaas.listSubscriptionsByCustomer.mockResolvedValue([sub]);
    asaas.listSubscriptionPayments.mockResolvedValue(payments);
  };
  const owned = (over: Record<string, unknown> = {}) => ({
    tenantId: TENANT,
    planId: "plan-pro",
    courtesy: false,
    method: "CARD_RECURRING",
    providerSubscriptionId: "sub_1",
    status: "ACTIVE",
    currentPeriodEnd: new Date(Date.now() + 10 * DAY),
    ...over,
  });

  it("1ª cobrança confirmada: ativa o plano, guarda o id da assinatura e o fim do primeiro mês", async () => {
    const { service, asaas, state } = build({ attempt: pending() });
    provider(asaas, subscription(), [charge()]);

    const before = Date.now();
    await service.syncAttempt(ATTEMPT);

    expect(state.subscription).toMatchObject({
      status: "ACTIVE",
      method: "CARD_RECURRING",
      providerSubscriptionId: "sub_1",
      courtesy: false,
      cancelAtPeriodEnd: false,
    });
    const days = (((state.subscription as { currentPeriodEnd: Date }).currentPeriodEnd.getTime()) - before) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
  });

  it("procura a assinatura pelo cliente DESTA tentativa (nunca por algo do corpo de um webhook)", async () => {
    const { service, asaas } = build({ attempt: pending() });
    provider(asaas, subscription(), [charge()]);
    await service.syncAttempt(ATTEMPT);
    expect(asaas.listSubscriptionsByCustomer).toHaveBeenCalledWith("cus_1");
    expect(asaas.listSubscriptionPayments).toHaveBeenCalledWith("sub_1");
  });

  it("checkout ainda não concluído (sem assinatura): não muda nada", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    asaas.listSubscriptionsByCustomer.mockResolvedValue([]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("assinatura criada mas a cobrança ainda não foi confirmada: não ativa (assinatura ACTIVE não é pagamento)", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    provider(asaas, subscription(), [charge({ status: "PENDING" })]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("'recebida em dinheiro' (marcação manual) não ativa o plano", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    provider(asaas, subscription(), [charge({ status: "RECEIVED_IN_CASH" })]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("assinatura de OUTRO cliente é ignorada", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    provider(asaas, subscription({ customer: "cus_de_outro" }), [charge()]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("tentativa sem cliente do provedor (anterior ao campo) não consulta nada", async () => {
    const { service, asaas } = build({ attempt: pending({ providerCustomerId: null }) });
    await service.syncAttempt(ATTEMPT);
    expect(asaas.listSubscriptionsByCustomer).not.toHaveBeenCalled();
  });

  it("valor pago diferente do que cobramos não ativa", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    provider(asaas, subscription(), [charge({ value: 1 })]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("cobranças removidas no provedor não contam", async () => {
    const { service, tx, asaas } = build({ attempt: pending() });
    provider(asaas, subscription(), [charge({ deleted: true })]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("aplicar duas vezes não duplica (tentativa só sai de PENDING uma vez)", async () => {
    const { service, tx, asaas } = build({ attempt: pending({ couponRedemptionId: "red-1" }) });
    provider(asaas, subscription(), [charge()]);
    await service.syncAttempt(ATTEMPT);
    await service.syncAttempt(ATTEMPT);
    expect(tx.couponRedemption.updateMany).toHaveBeenCalledTimes(1);
  });

  it("mês seguinte confirmado: o período avança e segue ACTIVE", async () => {
    const nextMonth = asaasDate(new Date(Date.now() + 31 * DAY));
    const { service, asaas, state } = build({
      attempt: pending({ status: "APPROVED" }),
      subscription: owned({ status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - DAY) }),
    });
    provider(asaas, subscription(), [charge(), charge({ id: "pay_b", dueDate: nextMonth })]);

    await service.syncAttempt(ATTEMPT);

    expect((state.subscription as Record<string, unknown>).status).toBe("ACTIVE");
    const end = (state.subscription as { currentPeriodEnd: Date }).currentPeriodEnd.getTime();
    expect(end).toBeGreaterThan(Date.now() + 55 * DAY);
  });

  it("cobrança do mês vencida e sem pagamento novo: em atraso (PAST_DUE), mantendo a assinatura", async () => {
    const { service, asaas, state } = build({ attempt: pending({ status: "APPROVED" }), subscription: owned() });
    provider(asaas, subscription(), [charge({ status: "OVERDUE" })]);
    await service.syncAttempt(ATTEMPT);
    expect((state.subscription as Record<string, unknown>).status).toBe("PAST_DUE");
  });

  it("assinatura removida/inativada no provedor: o que foi pago vale até o fim do período", async () => {
    const { service, asaas, state } = build({ attempt: pending({ status: "APPROVED" }), subscription: owned() });
    provider(asaas, subscription({ status: "INACTIVE" }), [charge()]);
    await service.syncAttempt(ATTEMPT);
    expect((state.subscription as Record<string, unknown>).cancelAtPeriodEnd).toBe(true);
  });

  it("assinatura apagada no provedor (só aparece como removida): trata como cancelada", async () => {
    const { service, asaas, state } = build({ attempt: pending({ status: "APPROVED" }), subscription: owned() });
    asaas.listSubscriptionsByCustomer.mockResolvedValue([subscription({ deleted: true })]);
    await service.syncAttempt(ATTEMPT);
    expect((state.subscription as Record<string, unknown>).cancelAtPeriodEnd).toBe(true);
  });

  it("desistiu antes de pagar (assinatura removida sem nenhuma cobrança paga): tentativa FAILED e cupom devolvido", async () => {
    const { service, tx, asaas, state } = build({
      attempt: pending({ couponRedemptionId: "red-1", couponReserved: true }),
    });
    tx.couponRedemption.findUnique.mockResolvedValue({ id: "red-1", couponId: "c-1", appliedAt: null });
    provider(asaas, subscription({ status: "INACTIVE" }), []);
    await service.syncAttempt(ATTEMPT);
    expect((state.attempt as Record<string, unknown>).status).toBe("FAILED");
    expect(tx.couponRedemption.delete).toHaveBeenCalled();
  });

  it("tentativa já encerrada (FAILED/EXPIRED) que nunca virou a assinatura do negócio não ativa nada, mesmo com cobrança paga", async () => {
    const { service, tx, asaas } = build({ attempt: pending({ status: "EXPIRED" }) });
    provider(asaas, subscription(), [charge()]);
    await service.syncAttempt(ATTEMPT);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("com desconto na 1ª cobrança, depois que ela foi confirmada volta ao preço cheio", async () => {
    const { service, asaas } = build({ attempt: pending({ discountCents: 1998, chargeCents: 7992 }) });
    provider(asaas, subscription({ value: 79.92 }), [charge({ value: 79.92 })]);
    await service.syncAttempt(ATTEMPT);
    expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith("sub_1", 9990);
  });

  // Antes da 1ª cobrança confirmada nem se ativa o plano: restaurar já faria a 1ª sair cheia.
  it("antes da 1ª cobrança confirmada NÃO restaura o preço", async () => {
    const { service, asaas } = build({ attempt: pending({ discountCents: 1998, chargeCents: 7992 }) });
    provider(asaas, subscription({ value: 79.92 }), [charge({ value: 79.92, status: "PENDING" })]);
    await service.syncAttempt(ATTEMPT);
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
  });

  it("falha ao voltar ao preço cheio não derruba a ativação (fica no log; a próxima leitura tenta de novo)", async () => {
    const { service, asaas, state } = build({ attempt: pending({ discountCents: 1998, chargeCents: 7992 }) });
    provider(asaas, subscription({ value: 79.92 }), [charge({ value: 79.92 })]);
    asaas.updateSubscriptionValue.mockRejectedValueOnce(new PaymentProviderError(400, "tokenização"));
    await expect(service.syncAttempt(ATTEMPT)).resolves.toBeUndefined();
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
  });
});

describe("PaymentsService.syncCardForTenant", () => {
  it("relê as tentativas de cartão mais recentes DO NEGÓCIO (tenant no WHERE)", async () => {
    const attempt = {
      id: ATTEMPT, tenantId: TENANT, planId: "plan-pro", method: "CARD_RECURRING", status: "PENDING",
      listPriceCents: 9990, discountCents: 0, chargeCents: 9990, couponRedemptionId: null, couponReserved: false,
      providerRef: "chk_1", providerCustomerId: "cus_1",
    };
    const { service, prisma, asaas } = build({ attempt });
    (prisma.billingAttempt.findMany as jest.Mock).mockResolvedValueOnce([{ id: ATTEMPT }]);
    (asaas.listSubscriptionsByCustomer as jest.Mock).mockResolvedValue([
      { id: "sub_1", status: "ACTIVE", customer: "cus_1", value: 99.9 },
    ]);
    (asaas.listSubscriptionPayments as jest.Mock).mockResolvedValue([
      { id: "pay_a", status: "CONFIRMED", value: 99.9, dueDate: asaasDate(new Date()) },
    ]);

    await service.syncCardForTenant(TENANT);

    expect(prisma.billingAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, method: "CARD_RECURRING", providerCustomerId: { not: null } },
      }),
    );
    expect(asaas.listSubscriptionsByCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("erro do provedor não derruba quem chamou", async () => {
    const { service, prisma, asaas } = build();
    (prisma.billingAttempt.findMany as jest.Mock).mockResolvedValueOnce([{ id: ATTEMPT }]);
    (prisma.billingAttempt.findUnique as jest.Mock).mockResolvedValueOnce({ id: ATTEMPT, method: "CARD_RECURRING", providerRef: "chk_1", providerCustomerId: "cus_1" });
    (asaas.listSubscriptionsByCustomer as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "x"));
    await expect(service.syncCardForTenant(TENANT)).resolves.toBeUndefined();
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
  const pixAttempt = {
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
    providerRef: "pay_1",
    providerCustomerId: "cus_1",
  };
  const cardAttempt = { ...pixAttempt, method: "CARD_RECURRING", providerRef: "chk_1" };

  it("o corpo é só um aviso: relê a cobrança no provedor e aplica pela referência (Pix)", async () => {
    const { service, asaas, state } = build({ attempt: pixAttempt });
    (asaas.getPayment as jest.Mock).mockResolvedValue({ id: "pay_1", status: "RECEIVED", externalReference: ATTEMPT, value: 99.9 });

    await service.handleNotification("payment", "pay_1");

    expect(asaas.getPayment).toHaveBeenCalledWith("pay_1");
    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
  });

  it("mensalidade do cartão (sem referência): acha a tentativa pelo CLIENTE relido no provedor", async () => {
    const { service, asaas, prisma, state } = build({ attempt: cardAttempt });
    (asaas.getPayment as jest.Mock).mockResolvedValue({ id: "pay_a", status: "CONFIRMED", externalReference: null, customer: "cus_1", subscription: "sub_1" });
    asaas.listSubscriptionsByCustomer.mockResolvedValue([{ id: "sub_1", status: "ACTIVE", customer: "cus_1", value: 99.9 }]);
    asaas.listSubscriptionPayments.mockResolvedValue([{ id: "pay_a", status: "CONFIRMED", value: 99.9, dueDate: asaasDate(new Date()) }]);

    await service.handleNotification("payment", "pay_a");

    expect(prisma.billingAttempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { providerCustomerId: "cus_1" } }));
    expect((state.subscription as Record<string, unknown>).providerSubscriptionId).toBe("sub_1");
  });

  it("aviso de assinatura: relê a assinatura e segue pelo cliente dela", async () => {
    const { service, asaas, prisma } = build({ attempt: cardAttempt });
    (asaas.getSubscription as jest.Mock).mockResolvedValue({ id: "sub_1", status: "ACTIVE", customer: "cus_1" });

    await service.handleNotification("subscription", "sub_1");

    expect(asaas.getSubscription).toHaveBeenCalledWith("sub_1");
    expect(prisma.billingAttempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { providerCustomerId: "cus_1" } }));
    expect(asaas.listSubscriptionsByCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("aviso de checkout: o id só acha a tentativa no NOSSO banco; o estado vem da releitura", async () => {
    const { service, asaas, prisma } = build({ attempt: cardAttempt });
    await service.handleNotification("checkout", "chk_1");
    expect(prisma.billingAttempt.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { providerRef: "chk_1" } }));
    expect(asaas.listSubscriptionsByCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("referência que não é um id nosso (UUID) e cliente desconhecido: ignorada", async () => {
    const { service, asaas, tx, prisma } = build();
    (prisma.billingAttempt.findFirst as jest.Mock).mockResolvedValue(null);
    (asaas.getPayment as jest.Mock).mockResolvedValue({ id: "pay_x", status: "RECEIVED", externalReference: "alguma-coisa", customer: "cus_x" });
    await service.handleNotification("payment", "pay_x");
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("tipo desconhecido e id gigante são ignorados sem chamar o provedor", async () => {
    const { service, asaas } = build();
    await service.handleNotification("plan", "123");
    await service.handleNotification("payment", "9".repeat(80));
    await service.handleNotification("payment", "");
    expect(asaas.getPayment).not.toHaveBeenCalled();
    expect(asaas.getSubscription).not.toHaveBeenCalled();
  });

  it("provedor não conhece o id (404): ignora com 200, sem estourar (não há o que reentregar)", async () => {
    const { service, asaas } = build();
    (asaas.getPayment as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(404, "not found"));
    await expect(service.handleNotification("payment", "pay_999")).resolves.toBeUndefined();
  });

  it("falha do provedor (5xx/rede): 503, para o provedor reentregar depois", async () => {
    const { service, asaas } = build();
    (asaas.getPayment as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "boom"));
    await expect(service.handleNotification("payment", "pay_999")).rejects.toThrow(/indisponível/);
  });

  it("sem provedor configurado: não faz nada", async () => {
    const { service, asaas } = build({ configured: false });
    await service.handleNotification("payment", "pay_1");
    expect(asaas.getPayment).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.expireStaleAttempts", () => {
  const stalePix = {
    id: ATTEMPT, tenantId: TENANT, planId: "plan-pro", method: "PIX_MONTHLY", status: "PENDING",
    listPriceCents: 9990, discountCents: 0, chargeCents: 9990, couponRedemptionId: null, couponReserved: false,
    providerRef: "pay_1", providerCustomerId: "cus_1", expiresAt: new Date(Date.now() - DAY),
  };

  it("Pix vencido e ainda não pago: tentativa EXPIRED e a cobrança sai do ar no provedor (não pode ser paga depois)", async () => {
    const { service, asaas, prisma, state } = build({ attempt: stalePix });
    (prisma.billingAttempt.findMany as jest.Mock).mockResolvedValueOnce([{ id: ATTEMPT }]);
    (asaas.getPayment as jest.Mock).mockResolvedValue({ id: "pay_1", status: "PENDING", externalReference: ATTEMPT, value: 99.9 });

    await service.expireStaleAttempts();

    expect((state.attempt as Record<string, unknown>).status).toBe("EXPIRED");
    expect(asaas.deletePayment).toHaveBeenCalledWith("pay_1");
  });

  it("Pix vencido mas JÁ pago (webhook não chegou): a releitura credita e NÃO remove a cobrança", async () => {
    const { service, asaas, prisma, state } = build({ attempt: stalePix });
    (prisma.billingAttempt.findMany as jest.Mock).mockResolvedValueOnce([{ id: ATTEMPT }]);
    (asaas.getPayment as jest.Mock).mockResolvedValue({ id: "pay_1", status: "RECEIVED", externalReference: ATTEMPT, value: 99.9 });

    await service.expireStaleAttempts();

    expect((state.attempt as Record<string, unknown>).status).toBe("APPROVED");
    expect(asaas.deletePayment).not.toHaveBeenCalled();
  });

  it("checkout de cartão vencido: EXPIRED, sem apagar cobrança (o checkout expira sozinho no Asaas)", async () => {
    const { service, asaas, prisma, state } = build({
      attempt: { ...stalePix, method: "CARD_RECURRING", providerRef: "chk_1" },
    });
    (prisma.billingAttempt.findMany as jest.Mock).mockResolvedValueOnce([{ id: ATTEMPT }]);

    await service.expireStaleAttempts();

    expect((state.attempt as Record<string, unknown>).status).toBe("EXPIRED");
    expect(asaas.deletePayment).not.toHaveBeenCalled();
  });

  it("sem provedor configurado: não consulta nada", async () => {
    const { service, prisma } = build({ configured: false });
    await service.expireStaleAttempts();
    expect(prisma.billingAttempt.findMany).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.cancel", () => {
  it("cartão: encerra a recorrência no provedor e mantém o acesso até o fim do período", async () => {
    const { service, asaas, prisma } = build({
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "sub_1", status: "ACTIVE", cancelAtPeriodEnd: false },
    });
    await service.cancel(TENANT);
    expect(asaas.deleteSubscription).toHaveBeenCalledWith("sub_1");
    expect((prisma.subscription as unknown as { updateMany: jest.Mock }).updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, courtesy: false },
      data: { cancelAtPeriodEnd: true },
    });
  });

  it("Pix: não há recorrência a cancelar, só marca o fim no período", async () => {
    const { service, asaas } = build({
      subscription: { courtesy: false, method: "PIX_MONTHLY", providerSubscriptionId: null, status: "ACTIVE", cancelAtPeriodEnd: false },
    });
    await service.cancel(TENANT);
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
  });

  it("cortesia não é cancelada por aqui (409)", async () => {
    const { service } = build({ subscription: { courtesy: true } });
    await expect(service.cancel(TENANT)).rejects.toThrow(ConflictException);
  });

  it("falha do provedor ao cancelar: 502 e NADA é marcado (não finge que cancelou)", async () => {
    const { service, asaas, prisma } = build({
      subscription: { courtesy: false, method: "CARD_RECURRING", providerSubscriptionId: "sub_1", status: "ACTIVE", cancelAtPeriodEnd: false },
    });
    (asaas.deleteSubscription as jest.Mock).mockRejectedValueOnce(new PaymentProviderError(500, "x"));
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
    providerSubscriptionId: "sub_1",
    status: "ACTIVE",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(Date.now() + 15 * DAY),
    ...over,
  });
  const paidPix = (over: Record<string, unknown> = {}) =>
    paidCard({ method: "PIX_MONTHLY", providerSubscriptionId: null, ...over });
  const confirmed = [{ id: "pay_a", status: "CONFIRMED", value: 99.9, dueDate: "2026-11-01" }];

  it("upgrade no cartão: atualiza o valor da recorrência no provedor e grava o plano", async () => {
    const { service, asaas, state } = build({ subscription: paidCard() });
    asaas.listSubscriptionPayments.mockResolvedValue(confirmed);

    const result = await service.changePlan(TENANT, "PREMIUM" as never);

    expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith("sub_1", 18990);
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-prem");
    expect(result.effective).toMatch(/próxima cobrança/);
  });

  // O requisito: não dá para rebaixar para um plano que não comporta a equipe que o negócio tem.
  it("downgrade com equipe MAIOR que o plano novo é recusado e nada muda", async () => {
    const { service, asaas, planLimit, state } = build({ subscription: paidCard() });
    (planLimit.assertCanDowngrade as jest.Mock).mockRejectedValueOnce(
      new ConflictException("Você tem 4 profissionais ativos, mas o plano Essencial permite no máximo 2."),
    );

    await expect(service.changePlan(TENANT, "ESSENCIAL" as never)).rejects.toThrow(/4 profissionais ativos/);

    expect(planLimit.assertCanDowngrade).toHaveBeenCalledWith(TENANT, "ESSENCIAL");
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-pro");
  });

  it("downgrade que a equipe comporta é permitido", async () => {
    const { service, asaas, state } = build({ subscription: paidCard() });
    asaas.listSubscriptionPayments.mockResolvedValue(confirmed);
    await service.changePlan(TENANT, "ESSENCIAL" as never);
    expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith("sub_1", 4990);
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-ess");
  });

  it("Pix: troca o plano sem falar com o provedor; o valor novo vale no próximo Pix", async () => {
    const { service, asaas, state } = build({ subscription: paidPix() });
    const result = await service.changePlan(TENANT, "PREMIUM" as never);
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-prem");
    expect(result.effective).toMatch(/próximo Pix/);
  });

  it("falha do provedor ao trocar: 502 e o plano NÃO muda (não finge que trocou)", async () => {
    const { service, asaas, state } = build({ subscription: paidCard() });
    asaas.listSubscriptionPayments.mockResolvedValue(confirmed);
    asaas.updateSubscriptionValue.mockRejectedValueOnce(new PaymentProviderError(500, "x"));
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toBeInstanceOf(BadGatewayException);
    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-pro");
  });

  it("antes da 1ª cobrança confirmada (valor ainda com o cupom) não troca", async () => {
    const { service, asaas } = build({ subscription: paidCard() });
    asaas.listSubscriptionPayments.mockResolvedValue([{ id: "pay_a", status: "PENDING", value: 79.92, dueDate: "2026-11-01" }]);
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toThrow(/primeira cobrança/);
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
  });

  it.each([
    ["sem assinatura", null, /assinatura paga/],
    ["cortesia (quem muda é a plataforma)", { courtesy: true, method: null, status: "ACTIVE" }, /assinatura paga/],
    ["cancelada", paidCard({ cancelAtPeriodEnd: true }), /cancelada/],
    ["em atraso", paidCard({ status: "PAST_DUE" }), /Regularize/],
    ["mesmo plano", paidCard({ planId: "plan-prem" }), /já é o seu plano/],
    ["Pix com o mês vencido", paidPix({ currentPeriodEnd: new Date(Date.now() - DAY) }), /próximo mês/],
  ])("recusa a troca: %s", async (_label, subscription, message) => {
    const { service, asaas } = build({ subscription: subscription as Record<string, unknown> | null });
    await expect(service.changePlan(TENANT, "PREMIUM" as never)).rejects.toThrow(message as RegExp);
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
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
      providerRef: "chk_1",
      providerCustomerId: "cus_1",
    };
    const { service, asaas, state } = build({
      attempt,
      subscription: {
        tenantId: TENANT,
        planId: "plan-prem",
        courtesy: false,
        method: "CARD_RECURRING",
        providerSubscriptionId: "sub_1",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 10 * DAY),
      },
    });
    asaas.listSubscriptionsByCustomer.mockResolvedValue([{ id: "sub_1", status: "ACTIVE", customer: "cus_1", value: 189.9 }]);
    asaas.listSubscriptionPayments.mockResolvedValue([
      { id: "pay_a", status: "CONFIRMED", value: 79.92, dueDate: asaasDate(new Date()) },
    ]);

    await service.syncAttempt(ATTEMPT);

    expect((state.subscription as Record<string, unknown>).planId).toBe("plan-prem");
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
  });
});

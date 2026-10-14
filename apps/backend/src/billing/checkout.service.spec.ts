import { BadGatewayException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { PlanTier, Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { CheckoutService } from "./checkout.service";
import { StripeService } from "./stripe.service";

const USER: AuthenticatedUser = { userId: "user-1", tenantId: "tenant-do-jwt", role: Role.OWNER };

function tenantRow(overrides: Record<string, unknown> = {}) {
  return { id: "tenant-do-jwt", name: "Barbearia do Zé", stripeCustomerId: null, subscription: null, ...overrides };
}

function build(options: { tenant?: Record<string, unknown>; updateCount?: number; stripeOverrides?: Record<string, unknown> } = {}) {
  const tenant = options.tenant ?? tenantRow();
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(tenant),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
    },
    plan: { findUnique: jest.fn().mockResolvedValue({ id: "plan-1", tier: PlanTier.PROFISSIONAL }) },
    user: { findFirst: jest.fn().mockResolvedValue({ email: "ze@barbearia.com" }) },
  } as unknown as PrismaService;
  const sdk = {
    customers: { create: jest.fn().mockResolvedValue({ id: "cus_novo" }) },
    checkout: { sessions: { create: jest.fn().mockResolvedValue({ url: "https://checkout.stripe.test/s1" }) } },
    billingPortal: { sessions: { create: jest.fn().mockResolvedValue({ url: "https://portal.stripe.test/p1" }) } },
  };
  const stripe = {
    sdk,
    priceIdForTier: jest.fn((tier: PlanTier) => `price_${tier.toLowerCase()}`),
    assertPriceMatchesCatalog: jest.fn().mockResolvedValue(undefined),
    frontendUrl: jest.fn().mockReturnValue("https://app.test"),
    ...options.stripeOverrides,
  } as unknown as StripeService;
  return { service: new CheckoutService(prisma, stripe), prisma, sdk, stripe };
}

describe("CheckoutService.createCheckout", () => {
  it("cria o customer uma vez, grava no tenant e abre a sessão de assinatura", async () => {
    const { service, prisma, sdk } = build();

    const result = await service.createCheckout(USER, PlanTier.PROFISSIONAL);

    expect(result).toEqual({ url: "https://checkout.stripe.test/s1" });
    expect(sdk.customers.create).toHaveBeenCalledWith(
      { name: "Barbearia do Zé", email: "ze@barbearia.com", metadata: { tenantId: "tenant-do-jwt", product: "totalagenda" } },
      { idempotencyKey: "totalagenda-customer-tenant-do-jwt" },
    );
    // UPDATE condicional (só se ainda nulo): duas requisições simultâneas não sobrescrevem uma à outra.
    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: { id: "tenant-do-jwt", stripeCustomerId: null },
      data: { stripeCustomerId: "cus_novo" },
    });
    expect(sdk.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  // Confiança no cliente: o dono só escolhe o tier. Preço, tenant, customer e URLs saem do servidor.
  it("monta a sessão só com dados do servidor: Price do env, tenant do JWT e URLs do FRONTEND_URL", async () => {
    const { service, sdk } = build();

    await service.createCheckout(USER, PlanTier.PREMIUM);

    expect(sdk.checkout.sessions.create).toHaveBeenCalledWith({
      mode: "subscription",
      customer: "cus_novo",
      line_items: [{ price: "price_premium", quantity: 1 }],
      success_url: "https://app.test/dashboard/plano?checkout=success",
      cancel_url: "https://app.test/dashboard/plano?checkout=cancelled",
      client_reference_id: "tenant-do-jwt",
      subscription_data: { metadata: { tenantId: "tenant-do-jwt", product: "totalagenda" } },
      metadata: { tenantId: "tenant-do-jwt", product: "totalagenda" },
      locale: "pt-BR",
    });
  });

  it("lê o tenant do JWT (WHERE id) e nunca de outro lugar", async () => {
    const { service, prisma } = build();

    await service.createCheckout(USER, PlanTier.ESSENCIAL);

    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tenant-do-jwt" } }),
    );
  });

  it("reaproveita o customer que o tenant já tem, sem criar outro", async () => {
    const { service, sdk } = build({ tenant: tenantRow({ stripeCustomerId: "cus_existente" }) });

    await service.createCheckout(USER, PlanTier.ESSENCIAL);

    expect(sdk.customers.create).not.toHaveBeenCalled();
    expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_existente" }));
  });

  it("perdeu a corrida na gravação do customer: usa o que o vencedor gravou", async () => {
    const { service, prisma, sdk } = build({ updateCount: 0 });
    (prisma.tenant.findUniqueOrThrow as jest.Mock)
      .mockResolvedValueOnce(tenantRow())
      .mockResolvedValueOnce({ stripeCustomerId: "cus_do_vencedor" });

    await service.createCheckout(USER, PlanTier.ESSENCIAL);

    expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_do_vencedor" }));
  });

  // Regressão de dinheiro: checkout com assinatura viva criaria uma segunda cobrança no mesmo customer.
  it.each(["ACTIVE", "PAST_DUE", "UNPAID"])("recusa novo checkout com assinatura %s, sem tocar no Stripe", async (status) => {
    const { service, sdk } = build({ tenant: tenantRow({ stripeCustomerId: "cus_1", subscription: { status } }) });

    await expect(service.createCheckout(USER, PlanTier.PREMIUM)).rejects.toBeInstanceOf(ConflictException);
    expect(sdk.checkout.sessions.create).not.toHaveBeenCalled();
    expect(sdk.customers.create).not.toHaveBeenCalled();
  });

  it.each(["CANCELED", "INCOMPLETE"])("permite assinar de novo com assinatura %s", async (status) => {
    const { service } = build({ tenant: tenantRow({ stripeCustomerId: "cus_1", subscription: { status } }) });

    await expect(service.createCheckout(USER, PlanTier.PREMIUM)).resolves.toEqual({
      url: "https://checkout.stripe.test/s1",
    });
  });

  it("sem configuração de cobrança responde 503 antes de criar qualquer coisa no Stripe", async () => {
    const { service, sdk } = build({
      stripeOverrides: {
        priceIdForTier: jest.fn(() => {
          throw new ServiceUnavailableException("Cobrança não configurada neste ambiente.");
        }),
      },
    });

    await expect(service.createCheckout(USER, PlanTier.PREMIUM)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sdk.customers.create).not.toHaveBeenCalled();
  });

  it("falha do Stripe vira 502 genérico e não vaza a mensagem original", async () => {
    const { service, sdk } = build();
    sdk.checkout.sessions.create.mockRejectedValue(
      Object.assign(new Error("No such price: 'price_secreto_123' (chave sk_test_XYZ)"), {
        type: "StripeInvalidRequestError",
        code: "resource_missing",
      }),
    );

    const attempt = service.createCheckout(USER, PlanTier.PREMIUM);

    await expect(attempt).rejects.toBeInstanceOf(BadGatewayException);
    await expect(attempt).rejects.not.toThrow(/price_secreto|sk_test/);
  });
});

describe("CheckoutService.createPortal", () => {
  it("abre o portal do customer do PRÓPRIO tenant, voltando para /dashboard/plano", async () => {
    const { service, sdk, prisma } = build({ tenant: tenantRow({ stripeCustomerId: "cus_do_tenant" }) });

    await expect(service.createPortal(USER)).resolves.toEqual({ url: "https://portal.stripe.test/p1" });

    expect(sdk.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_do_tenant",
      return_url: "https://app.test/dashboard/plano",
    });
    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "tenant-do-jwt" } });
  });

  it("sem customer (nunca assinou) responde 409 e não chama o Stripe", async () => {
    const { service, sdk } = build();

    await expect(service.createPortal(USER)).rejects.toBeInstanceOf(ConflictException);
    expect(sdk.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("falha do Stripe vira 502 genérico", async () => {
    const { service, sdk } = build({ tenant: tenantRow({ stripeCustomerId: "cus_1" }) });
    sdk.billingPortal.sessions.create.mockRejectedValue(new Error("boom interno"));

    await expect(service.createPortal(USER)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

// O valor MOSTRADO vem do catálogo; o COBRADO, do Price do Stripe. Se divergirem, ninguém é cobrado: 503 antes de
// criar customer ou sessão de checkout.
describe("CheckoutService: Price do Stripe diferente do catálogo", () => {
  it("recusa com 503 e não cria customer nem sessão", async () => {
    const { service, sdk } = build({
      stripeOverrides: {
        assertPriceMatchesCatalog: jest.fn().mockRejectedValue(new ServiceUnavailableException("indisponível")),
      },
    });

    await expect(service.createCheckout(USER, PlanTier.PROFISSIONAL)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sdk.customers.create).not.toHaveBeenCalled();
    expect(sdk.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("confere o Price do plano ESCOLHIDO", async () => {
    const { service, stripe } = build();

    await service.createCheckout(USER, PlanTier.PROFISSIONAL);

    expect(stripe.assertPriceMatchesCatalog).toHaveBeenCalledWith(PlanTier.PROFISSIONAL);
  });
});

import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AsaasWebhookController } from "./asaas-webhook.controller";
import { PaymentsService } from "./payments.service";

const TOKEN = "token-do-webhook-com-mais-de-32-caracteres";

function build(token: string | null = TOKEN) {
  const payments = { handleNotification: jest.fn().mockResolvedValue(undefined) } as unknown as PaymentsService;
  const config = { get: (key: string) => (key === "ASAAS_WEBHOOK_TOKEN" ? (token ?? undefined) : undefined) } as unknown as ConfigService;
  return { controller: new AsaasWebhookController(payments, config), payments };
}

describe("AsaasWebhookController", () => {
  it("token certo: repassa o tipo do objeto e o id ao serviço (evento de cobrança)", async () => {
    const { controller, payments } = build();
    const result = await controller.receive({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }, TOKEN);
    expect(result).toEqual({ received: true });
    expect(payments.handleNotification).toHaveBeenCalledWith("payment", "pay_1");
  });

  it.each([
    ["PAYMENT_CONFIRMED", { payment: { id: "pay_2" } }, "payment", "pay_2"],
    ["PAYMENT_OVERDUE", { payment: { id: "pay_3" } }, "payment", "pay_3"],
    ["SUBSCRIPTION_DELETED", { subscription: { id: "sub_1" } }, "subscription", "sub_1"],
    ["SUBSCRIPTION_INACTIVATED", { subscription: { id: "sub_2" } }, "subscription", "sub_2"],
    ["CHECKOUT_PAID", { checkout: { id: "chk_1" } }, "checkout", "chk_1"],
    ["CHECKOUT_EXPIRED", { checkout: { id: "chk_2" } }, "checkout", "chk_2"],
  ])("%s usa o objeto certo do corpo", async (event, rest, kind, id) => {
    const { controller, payments } = build();
    await controller.receive({ event, ...rest }, TOKEN);
    expect(payments.handleNotification).toHaveBeenCalledWith(kind, id);
  });

  // Quem não tem o token (forjou o corpo) é recusado antes de qualquer chamada ao provedor.
  it.each([
    ["token errado", "outro-token-qualquer-com-mais-de-32-chars"],
    ["token vazio", ""],
    ["sem cabeçalho", undefined],
    ["token com o mesmo prefixo", TOKEN.slice(0, 20)],
    ["token com sufixo extra", TOKEN + "x"],
  ])("%s: 401 e nada é processado", async (_label, token) => {
    const { controller, payments } = build();
    await expect(controller.receive({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }, token)).rejects.toThrow(UnauthorizedException);
    expect(payments.handleNotification).not.toHaveBeenCalled();
  });

  it("sem token configurado (dev) processa: o corpo nunca é confiado, só vira aviso para reler", async () => {
    const { controller, payments } = build(null);
    await controller.receive({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }, undefined);
    expect(payments.handleNotification).toHaveBeenCalledWith("payment", "pay_1");
  });

  it("evento que não tratamos ou corpo vazio: 200 sem processar (o Asaas pausa a fila se não for 2xx)", async () => {
    const { controller, payments } = build();
    await expect(controller.receive({ event: "ACCOUNT_STATUS_UPDATED" }, TOKEN)).resolves.toEqual({ received: true });
    await expect(controller.receive({}, TOKEN)).resolves.toEqual({ received: true });
    await expect(controller.receive(undefined as never, TOKEN)).resolves.toEqual({ received: true });
    expect(payments.handleNotification).not.toHaveBeenCalled();
  });

  it("objeto sem id, id que não é texto ou id gigante não chegam ao serviço", async () => {
    const { controller, payments } = build();
    await controller.receive({ event: "PAYMENT_RECEIVED", payment: {} }, TOKEN);
    await controller.receive({ event: "PAYMENT_RECEIVED", payment: { id: 123 } }, TOKEN);
    await controller.receive({ event: "PAYMENT_RECEIVED", payment: { id: "9".repeat(100) } }, TOKEN);
    await controller.receive({ event: "PAYMENT_RECEIVED", subscription: { id: "sub_1" } }, TOKEN);
    expect(payments.handleNotification).not.toHaveBeenCalled();
  });
});

import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import { MercadoPagoWebhookController } from "./mercadopago-webhook.controller";
import { PaymentsService } from "./payments.service";

const SECRET = "segredo-do-webhook-1234567890";

function build(secret: string | null = SECRET) {
  const payments = { handleNotification: jest.fn().mockResolvedValue(undefined) } as unknown as PaymentsService;
  const config = { get: (key: string) => (key === "MERCADOPAGO_WEBHOOK_SECRET" ? (secret ?? undefined) : undefined) } as unknown as ConfigService;
  return { controller: new MercadoPagoWebhookController(payments, config), payments };
}

const sign = (manifest: string) => createHmac("sha256", SECRET).update(manifest).digest("hex");

describe("MercadoPagoWebhookController", () => {
  it("assinatura válida: repassa tipo e id (do query) ao serviço", async () => {
    const { controller, payments } = build();
    const v1 = sign("id:555;request-id:req-1;ts:1700000000;");

    const result = await controller.receive(
      { type: "payment", data: { id: "555" } },
      "555",
      undefined,
      undefined,
      `ts=1700000000,v1=${v1}`,
      "req-1",
    );

    expect(result).toEqual({ received: true });
    expect(payments.handleNotification).toHaveBeenCalledWith("payment", "555");
  });

  // Corpo forjado com assinatura inválida: recusado antes de qualquer chamada ao provedor.
  it("assinatura inválida: 401 e nada é processado", async () => {
    const { controller, payments } = build();
    await expect(
      controller.receive({ type: "payment", data: { id: "555" } }, "555", undefined, undefined, "ts=1,v1=" + "a".repeat(64), "req-1"),
    ).rejects.toThrow(UnauthorizedException);
    expect(payments.handleNotification).not.toHaveBeenCalled();
  });

  // Assinatura recorrente pode vir sem x-signature: segue (o serviço relê o estado no provedor).
  it("sem cabeçalho de assinatura: processa (o corpo nunca é confiado, só vira aviso para reler)", async () => {
    const { controller, payments } = build();
    await controller.receive({ type: "subscription_preapproval", data: { id: "abc" } }, undefined, undefined, undefined, undefined, undefined);
    expect(payments.handleNotification).toHaveBeenCalledWith("subscription_preapproval", "abc");
  });

  it("sem segredo configurado (dev) também processa", async () => {
    const { controller, payments } = build(null);
    await controller.receive({ type: "payment", data: { id: 9 } }, undefined, undefined, undefined, "ts=1,v1=zz", undefined);
    expect(payments.handleNotification).toHaveBeenCalledWith("payment", "9");
  });

  it("aceita o formato antigo (topic + id na query) sem corpo", async () => {
    const { controller, payments } = build(null);
    await controller.receive({}, "777", undefined, "payment", undefined, undefined);
    expect(payments.handleNotification).toHaveBeenCalledWith("payment", "777");
  });

  it("corpo vazio ou sem id: 200 sem processar", async () => {
    const { controller, payments } = build(null);
    await expect(controller.receive({}, undefined, undefined, undefined, undefined, undefined)).resolves.toEqual({ received: true });
    expect(payments.handleNotification).not.toHaveBeenCalled();
  });

  it("id gigante não chega ao serviço", async () => {
    const { controller, payments } = build(null);
    await controller.receive({ type: "payment", data: { id: "9".repeat(100) } }, undefined, undefined, undefined, undefined, undefined);
    expect(payments.handleNotification).not.toHaveBeenCalled();
  });
});

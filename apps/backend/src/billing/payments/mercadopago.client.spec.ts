import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MercadoPagoClient, PaymentProviderError } from "./mercadopago.client";

function build(env: Record<string, string | undefined> = { MERCADOPAGO_ACCESS_TOKEN: "TEST-token-de-teste-123" }) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new MercadoPagoClient(config);
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockFetch(response: { ok: boolean; status: number; body: unknown }) {
  const fn = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: async () => (response.body === undefined ? "" : JSON.stringify(response.body)),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("MercadoPagoClient", () => {
  it("isConfigured depende do token", () => {
    expect(build().isConfigured()).toBe(true);
    expect(build({}).isConfigured()).toBe(false);
  });

  it("sem token: 503, sem sair para a rede", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });
    await expect(build({}).getPayment("1")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cria o Pix com valor em reais, referência, e-mail e chave de idempotência", async () => {
    const fetchMock = mockFetch({ ok: true, status: 201, body: { id: 1 } });

    await build().createPixPayment({
      description: "Marquo",
      externalReference: "ref-1",
      payerEmail: "dono@x.com",
      amountCents: 7992,
      expiresAt: "2026-10-15T12:00:00.000-03:00",
      notificationUrl: "https://api.test/webhooks/mercadopago",
      idempotencyKey: "idem-1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/v1/payments");
    expect(init.headers).toMatchObject({ Authorization: "Bearer TEST-token-de-teste-123", "X-Idempotency-Key": "idem-1" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      transaction_amount: 79.92,
      payment_method_id: "pix",
      external_reference: "ref-1",
      payer: { email: "dono@x.com" },
      notification_url: "https://api.test/webhooks/mercadopago",
    });
  });

  it("assinatura pendente em reais, mensal, em BRL", async () => {
    const fetchMock = mockFetch({ ok: true, status: 201, body: { id: "pre-1" } });
    await build().createPreapproval({
      reason: "Marquo - Plano",
      externalReference: "ref-2",
      payerEmail: "dono@x.com",
      amountCents: 9990,
      backUrl: "https://app.test/dashboard/plano",
      notificationUrl: null,
      idempotencyKey: "idem-2",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      status: "pending",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 99.9, currency_id: "BRL" },
    });
    expect(body).not.toHaveProperty("notification_url");
  });

  // O corpo de erro do provedor pode ter dado interno: vai só para o log, nunca na exceção.
  it("erro HTTP vira PaymentProviderError sem o corpo da resposta", async () => {
    mockFetch({ ok: false, status: 400, body: { message: "detalhe-interno-secreto", cause: [{ code: 3000 }] } });
    const attempt = build().getPayment("1");
    await expect(attempt).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(attempt).rejects.not.toThrow(/detalhe-interno-secreto/);
  });

  it("falha de rede vira PaymentProviderError", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED token-vazado")) as unknown as typeof fetch;
    const attempt = build().getPayment("1");
    await expect(attempt).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(attempt).rejects.not.toThrow(/token-vazado/);
  });

  it("ids na URL são codificados (nada de path traversal para outro endpoint)", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });
    await build().getPreapproval("../v1/payments/1");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mercadopago.com/preapproval/..%2Fv1%2Fpayments%2F1");
  });

  it("MERCADOPAGO_API_BASE só vale fora de produção (token nunca vai para outro host em produção)", async () => {
    const dev = mockFetch({ ok: true, status: 200, body: {} });
    await build({ MERCADOPAGO_ACCESS_TOKEN: "TEST-token-de-teste-123", MERCADOPAGO_API_BASE: "http://localhost:4999/" }).getPayment("1");
    expect(dev.mock.calls[0][0]).toBe("http://localhost:4999/v1/payments/1");

    const prod = mockFetch({ ok: true, status: 200, body: {} });
    await build({
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-token-de-producao-123",
      MERCADOPAGO_API_BASE: "https://evil.example",
      NODE_ENV: "production",
    }).getPayment("1");
    expect(prod.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/1");
  });
});

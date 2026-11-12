import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AsaasClient, describeApiKey, isAsaasCheckoutUrl, PaymentProviderError } from "./asaas.client";

const SANDBOX_KEY = "$aact_hmlg_" + "x".repeat(40);
const PROD_KEY = "$aact_prod_" + "y".repeat(40);

function build(env: Record<string, string | undefined> = { ASAAS_API_KEY: SANDBOX_KEY }) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new AsaasClient(config);
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

describe("AsaasClient", () => {
  it("isConfigured depende da chave", () => {
    expect(build().isConfigured()).toBe(true);
    expect(build({}).isConfigured()).toBe(false);
  });

  it("sem chave: 503, sem sair para a rede", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });
    await expect(build({}).getPayment("pay_1")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("autentica pelo cabeçalho access_token e se identifica com User-Agent", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { id: "pay_1" } });
    await build().getPayment("pay_1");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ access_token: SANDBOX_KEY, "User-Agent": "Marquo" });
    // A chave nunca vai na URL nem no corpo.
    expect(fetchMock.mock.calls[0][0]).not.toContain("aact_");
  });

  it("o ambiente sai do prefixo da chave: sandbox x produção", async () => {
    const sandbox = mockFetch({ ok: true, status: 200, body: {} });
    await build({ ASAAS_API_KEY: SANDBOX_KEY }).getPayment("pay_1");
    expect(sandbox.mock.calls[0][0]).toBe("https://api-sandbox.asaas.com/v3/payments/pay_1");

    const prod = mockFetch({ ok: true, status: 200, body: {} });
    await build({ ASAAS_API_KEY: PROD_KEY }).getPayment("pay_1");
    expect(prod.mock.calls[0][0]).toBe("https://api.asaas.com/v3/payments/pay_1");
  });

  it("cria o cliente com documento, referência e sem os avisos próprios do Asaas", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { id: "cus_1" } });
    await build().createCustomer({ name: "Ana", email: "ana@x.com", cpfCnpj: "52998224725", externalReference: "ref-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v3\/customers$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "Ana",
      email: "ana@x.com",
      cpfCnpj: "52998224725",
      externalReference: "ref-1",
      notificationDisabled: true,
    });
  });

  it("cria a cobrança Pix com valor em reais, vencimento e referência", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { id: "pay_1" } });
    await build().createPixPayment({
      customerId: "cus_1",
      amountCents: 7992,
      dueDate: "2026-11-12",
      description: "Marquo",
      externalReference: "ref-1",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v3\/payments$/);
    expect(JSON.parse(init.body)).toEqual({
      customer: "cus_1",
      billingType: "PIX",
      value: 79.92,
      dueDate: "2026-11-12",
      description: "Marquo",
      externalReference: "ref-1",
    });
  });

  it("busca o QR Code do Pix da cobrança", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { payload: "0002...", encodedImage: "aGk=" } });
    await expect(build().getPixQrCode("pay_1")).resolves.toMatchObject({ payload: "0002..." });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/payments\/pay_1\/pixQrCode$/);
  });

  it("checkout recorrente só de cartão, mensal, com o cliente e SEM dado de cartão", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { id: "chk_1" } });
    await build().createCheckout({
      customerId: "cus_1",
      itemName: "Marquo - Plano Pro",
      itemDescription: "Assinatura mensal",
      amountCents: 9990,
      nextDueDate: "2026-11-12 23:59:59",
      minutesToExpire: 1440,
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/cancel",
      expiredUrl: "https://app.test/expired",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v3\/checkouts$/);
    expect(body).toMatchObject({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      customer: "cus_1",
      minutesToExpire: 1440,
      items: [{ name: "Marquo - Plano Pro", quantity: 1, value: 99.9 }],
      subscription: { cycle: "MONTHLY", nextDueDate: "2026-11-12 23:59:59" },
      callback: { successUrl: "https://app.test/ok", cancelUrl: "https://app.test/cancel", expiredUrl: "https://app.test/expired" },
    });
    expect(JSON.stringify(body)).not.toMatch(/creditCard|ccv/i);
  });

  it("link do checkout: usa o `link` do provedor quando é https em asaas.com; senão monta pelo id, no ambiente da chave", () => {
    expect(build().checkoutUrl({ id: "chk_1", link: "https://sandbox.asaas.com/checkoutSession/show/abc" })).toBe("https://sandbox.asaas.com/checkoutSession/show/abc");
    expect(build({ ASAAS_API_KEY: PROD_KEY }).checkoutUrl({ id: "chk_1" })).toBe("https://asaas.com/checkoutSession/show?id=chk_1");
    expect(build().checkoutUrl({ id: "chk_1", link: null })).toBe("https://sandbox.asaas.com/checkoutSession/show?id=chk_1");
    // `link` fora do asaas.com (redirecionamento aberto) ou que não é https (javascript:, http:) NUNCA é usado.
    for (const evil of ["https://evil.example/pay", "https://asaas.com.evil.example/x", "https://notasaas.com/x", "http://sandbox.asaas.com/x", "//evil.example", "https://evil.example/?u=https://asaas.com"]) {
      expect(build().checkoutUrl({ id: "chk_1", link: evil })).toBe("https://sandbox.asaas.com/checkoutSession/show?id=chk_1");
    }
    expect(build().checkoutUrl({ id: "chk_1", link: "javascript:alert(1)" })).toContain("checkoutSession/show?id=chk_1");
    expect(build().checkoutUrl({ id: "a b&x=1" })).toContain("id=a%20b%26x%3D1");
  });

  it("lista assinaturas do cliente e cobranças da assinatura (ids codificados, com limite)", async () => {
    const subs = mockFetch({ ok: true, status: 200, body: { data: [{ id: "sub_1" }] } });
    await expect(build().listSubscriptionsByCustomer("cus_1")).resolves.toEqual([{ id: "sub_1" }]);
    expect(subs.mock.calls[0][0]).toMatch(/\/subscriptions\?customer=cus_1&limit=10$/);

    const pays = mockFetch({ ok: true, status: 200, body: { data: [{ id: "pay_1" }] } });
    await expect(build().listSubscriptionPayments("sub_1")).resolves.toEqual([{ id: "pay_1" }]);
    expect(pays.mock.calls[0][0]).toMatch(/\/subscriptions\/sub_1\/payments\?limit=100$/);

    mockFetch({ ok: true, status: 200, body: {} });
    await expect(build().listSubscriptionsByCustomer("cus_1")).resolves.toEqual([]);
  });

  it("muda o valor da assinatura em reais e leva a mudança às cobranças pendentes", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { id: "sub_1" } });
    await build().updateSubscriptionValue("sub_1", 18990);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/subscriptions\/sub_1$/);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ value: 189.9, updatePendingPayments: true });
  });

  it("remover assinatura/cobrança que já não existe (404) conta como feito; outro erro propaga", async () => {
    mockFetch({ ok: false, status: 404, body: { errors: [] } });
    await expect(build().deleteSubscription("sub_1")).resolves.toBeUndefined();
    await expect(build().deletePayment("pay_1")).resolves.toBeUndefined();

    mockFetch({ ok: false, status: 500, body: {} });
    await expect(build().deleteSubscription("sub_1")).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(build().deletePayment("pay_1")).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it("remover usa DELETE no endereço certo", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: { deleted: true } });
    await build().deleteSubscription("sub_1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/subscriptions\/sub_1$/);
  });

  // O corpo de erro do provedor pode ter dado interno: vai só para o log, nunca na exceção.
  it("erro HTTP vira PaymentProviderError sem o corpo da resposta", async () => {
    mockFetch({ ok: false, status: 400, body: { errors: [{ code: "invalid", description: "detalhe-interno-secreto" }] } });
    const attempt = build().getPayment("pay_1");
    await expect(attempt).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(attempt).rejects.not.toThrow(/detalhe-interno-secreto/);
  });

  it("o log do erro não ecoa CPF/CNPJ que o provedor devolva", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mockFetch({ ok: false, status: 400, body: { errors: [{ description: "CPF 529.982.247-25 e CNPJ 11222333000181 inválidos" }] } });
    await expect(build().getPayment("pay_1")).rejects.toBeInstanceOf(PaymentProviderError);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toMatch(/529\.982|52998224725|11222333000181/);
    expect(logged).toContain("[numero]");
    warn.mockRestore();
  });

  it("a chave nunca aparece em log nenhum, nem em erro de rede nem em erro HTTP", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    mockFetch({ ok: false, status: 401, body: { errors: [{ description: "chave " + SANDBOX_KEY }] } });
    await expect(build().getPayment("pay_1")).rejects.toBeInstanceOf(PaymentProviderError);
    global.fetch = jest.fn().mockRejectedValue(new Error(SANDBOX_KEY)) as unknown as typeof fetch;
    await expect(build().getPayment("pay_1")).rejects.toBeInstanceOf(PaymentProviderError);
    // O que NÃO pode vazar é o valor da chave no log da falha de REDE (nome do erro apenas).
    const networkLog = String(warn.mock.calls.at(-1)?.[0]);
    expect(networkLog).not.toContain(SANDBOX_KEY);
    warn.mockRestore();
  });

  it("a exceção carrega o status HTTP (o serviço trata 404 de forma diferente de 5xx)", async () => {
    mockFetch({ ok: false, status: 404, body: {} });
    await expect(build().getPayment("pay_1")).rejects.toMatchObject({ status: 404 });
  });

  it("falha de rede vira PaymentProviderError sem vazar a mensagem original", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED chave-vazada")) as unknown as typeof fetch;
    const attempt = build().getPayment("pay_1");
    await expect(attempt).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(attempt).rejects.not.toThrow(/chave-vazada/);
  });

  it("ids na URL são codificados (nada de path traversal para outro endpoint)", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, body: {} });
    await build().getSubscription("../payments/pay_1");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api-sandbox.asaas.com/v3/subscriptions/..%2Fpayments%2Fpay_1");
  });

  it("ASAAS_API_BASE só vale fora de produção (a chave nunca vai para outro host em produção)", async () => {
    const dev = mockFetch({ ok: true, status: 200, body: {} });
    await build({ ASAAS_API_KEY: SANDBOX_KEY, ASAAS_API_BASE: "http://localhost:4999/v3/" }).getPayment("pay_1");
    expect(dev.mock.calls[0][0]).toBe("http://localhost:4999/v3/payments/pay_1");

    const prod = mockFetch({ ok: true, status: 200, body: {} });
    await build({ ASAAS_API_KEY: PROD_KEY, ASAAS_API_BASE: "https://evil.example", NODE_ENV: "production" }).getPayment("pay_1");
    expect(prod.mock.calls[0][0]).toBe("https://api.asaas.com/v3/payments/pay_1");
  });
});

describe("isAsaasCheckoutUrl", () => {
  it("só aceita https em asaas.com ou subdomínio", () => {
    expect(isAsaasCheckoutUrl("https://asaas.com/checkoutSession/show?id=1")).toBe(true);
    expect(isAsaasCheckoutUrl("https://sandbox.asaas.com/checkoutSession/show/1")).toBe(true);
    for (const bad of ["", "nao-e-url", "http://asaas.com/x", "https://evil.example", "https://asaas.com.evil.example", "https://evilasaas.com", "javascript:alert(1)", "https://user@evil.example@asaas.com.evil.example"]) {
      expect(isAsaasCheckoutUrl(bad)).toBe(false);
    }
  });
});

describe("describeApiKey (log do boot: de que ambiente é a chave)", () => {
  it("diz só o ambiente e NUNCA ecoa a chave", () => {
    expect(describeApiKey(SANDBOX_KEY)).toBe("sandbox");
    expect(describeApiKey(PROD_KEY)).toBe("produção");
    expect(describeApiKey("qualquer-coisa-secreta")).toBe("formato não reconhecido");
    for (const key of [SANDBOX_KEY, PROD_KEY, "qualquer-coisa-secreta"]) {
      expect(describeApiKey(key)).not.toContain(key.slice(-8));
    }
  });
});

describe("AsaasClient.onModuleInit", () => {
  it("loga o ambiente (ou desligado), nunca a chave, e nunca lança", () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    expect(() => build({ ASAAS_API_KEY: SANDBOX_KEY }).onModuleInit()).not.toThrow();
    expect(log).toHaveBeenLastCalledWith("Asaas ligado: ambiente sandbox");
    expect(String(log.mock.calls.at(-1)?.[0])).not.toContain("aact_");
    build({}).onModuleInit();
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("desligado");
    log.mockRestore();
  });
});

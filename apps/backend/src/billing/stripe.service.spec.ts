import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PlanTier } from "@marquo/database";
import { StripeService } from "./stripe.service";

function build(values: Record<string, string | undefined>) {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new StripeService(config);
}

const PRICES = {
  STRIPE_PRICE_ESSENCIAL: "price_ess",
  STRIPE_PRICE_PROFISSIONAL: "price_pro",
  STRIPE_PRICE_PREMIUM: "price_prem",
};

describe("StripeService", () => {
  it("cada tier usa o seu Price e o caminho inverso devolve o mesmo tier", () => {
    const service = build(PRICES);

    expect(service.priceIdForTier(PlanTier.ESSENCIAL)).toBe("price_ess");
    expect(service.priceIdForTier(PlanTier.PROFISSIONAL)).toBe("price_pro");
    expect(service.priceIdForTier(PlanTier.PREMIUM)).toBe("price_prem");
    for (const tier of Object.values(PlanTier)) {
      expect(service.tierForPriceId(service.priceIdForTier(tier))).toBe(tier);
    }
  });

  // O plano vem do Price, nunca de um nome: um Price desconhecido (ex.: assinatura do TotalPousada
  // na mesma conta do Stripe) não vira plano nenhum.
  it("Price desconhecido não corresponde a nenhum plano", () => {
    expect(build(PRICES).tierForPriceId("price_de_outro_produto")).toBeNull();
    expect(build({}).tierForPriceId("price_ess")).toBeNull();
  });

  it("sem configuração as operações de cobrança respondem 503, sem derrubar o processo", () => {
    const service = build({});

    expect(() => service.sdk).toThrow(ServiceUnavailableException);
    expect(() => service.priceIdForTier(PlanTier.PREMIUM)).toThrow(ServiceUnavailableException);
    expect(service.webhookSecret).toBeUndefined();
  });

  it("com a chave configurada devolve sempre o mesmo cliente do SDK", () => {
    const service = build({ STRIPE_SECRET_KEY: "sk_test_abc123" });

    expect(service.sdk).toBe(service.sdk);
  });

  it("frontendUrl usa FRONTEND_URL sem barra final e cai em localhost só em desenvolvimento", () => {
    expect(build({ FRONTEND_URL: "https://marquo.com.br/" }).frontendUrl()).toBe("https://marquo.com.br");
    expect(build({}).frontendUrl()).toBe("http://localhost:3000");
  });
});

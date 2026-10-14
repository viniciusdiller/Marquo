import "reflect-metadata";
import { validateEnv } from "./env.validation";

const base = {
  DATABASE_URL: "postgresql://x",
};

describe("validateEnv", () => {
  it("aceita JWT_SECRET forte", () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: "a".repeat(64) })).not.toThrow();
  });

  // Regressão: JWT_SECRET só exigia "não vazio" — um segredo de 4 caracteres subia normalmente e
  // assina todos os tokens do sistema.
  it("recusa JWT_SECRET curto (fail closed no boot)", () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: "curto" })).toThrow();
    expect(() => validateEnv({ ...base, JWT_SECRET: "a".repeat(31) })).toThrow();
  });

  describe("CLIENT_IP_SECRET (IP assinado do visitante)", () => {
    const strong = { ...base, JWT_SECRET: "a".repeat(40) };

    it("é opcional fora de produção", () => {
      expect(() => validateEnv(strong)).not.toThrow();
      expect(() => validateEnv({ ...strong, NODE_ENV: "development" })).not.toThrow();
    });

    it("é obrigatório em produção (sem ele o login teria um balde único)", () => {
      expect(() => validateEnv({ ...strong, NODE_ENV: "production" })).toThrow();
      // Produção completa: além do CLIENT_IP_SECRET exige FRONTEND_URL e as variáveis do Stripe.
      const prodComplete = {
        ...strong,
        NODE_ENV: "production",
        CLIENT_IP_SECRET: "c".repeat(32),
        INTERNAL_API_SECRET: "i".repeat(32),
        FRONTEND_URL: "https://marquo.com.br",
        STRIPE_SECRET_KEY: "sk_live_abc123",
        STRIPE_WEBHOOK_SECRET: "whsec_abc123",
        STRIPE_PRICE_ESSENCIAL: "price_e1",
        STRIPE_PRICE_PROFISSIONAL: "price_p1",
        STRIPE_PRICE_PREMIUM: "price_x1",
      };
      expect(() => validateEnv(prodComplete)).not.toThrow();
      const { CLIENT_IP_SECRET: _omit, ...withoutSecret } = prodComplete;
      expect(() => validateEnv(withoutSecret)).toThrow();
    });

    it("se vier, precisa ter 32+ caracteres em qualquer ambiente", () => {
      expect(() => validateEnv({ ...strong, CLIENT_IP_SECRET: "curto" })).toThrow();
      expect(() => validateEnv({ ...strong, CLIENT_IP_SECRET: "c".repeat(32) })).not.toThrow();
    });
  });

  it("INTERNAL_API_SECRET: opcional em dev, 32+ caracteres se vier, obrigatório em produção", () => {
    const strong = { ...base, JWT_SECRET: "a".repeat(40) };
    expect(() => validateEnv(strong)).not.toThrow();
    expect(() => validateEnv({ ...strong, INTERNAL_API_SECRET: "curto" })).toThrow();
    expect(() => validateEnv({ ...strong, INTERNAL_API_SECRET: "i".repeat(32) })).not.toThrow();
    // Produção sem o segredo: a API interna ficaria sem autenticação configurada (o guard falha fechado,
    // mas o boot deve avisar em vez de subir com o suporte mudo).
    const prodNoInternal = {
      ...strong,
      NODE_ENV: "production",
      CLIENT_IP_SECRET: "c".repeat(32),
      FRONTEND_URL: "https://marquo.com.br",
      STRIPE_SECRET_KEY: "sk_live_abc123",
      STRIPE_WEBHOOK_SECRET: "whsec_abc123",
      STRIPE_PRICE_ESSENCIAL: "price_e1",
      STRIPE_PRICE_PROFISSIONAL: "price_p1",
      STRIPE_PRICE_PREMIUM: "price_x1",
    };
    expect(() => validateEnv(prodNoInternal)).toThrow();
    expect(() => validateEnv({ ...prodNoInternal, INTERNAL_API_SECRET: "i".repeat(32) })).not.toThrow();
  });

  it("TRUST_PROXY_HOPS é opcional mas, se vier, precisa ser inteiro positivo", () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: "a".repeat(40), TRUST_PROXY_HOPS: "1" })).not.toThrow();
    expect(() => validateEnv({ ...base, JWT_SECRET: "a".repeat(40), TRUST_PROXY_HOPS: "0" })).toThrow();
  });
});

describe("validateEnv: Stripe e FRONTEND_URL", () => {
  const dev = { DATABASE_URL: "postgresql://x", JWT_SECRET: "a".repeat(40) };
  const stripe = {
    STRIPE_SECRET_KEY: "sk_test_abc123",
    STRIPE_WEBHOOK_SECRET: "whsec_abc123",
    STRIPE_PRICE_ESSENCIAL: "price_e1",
    STRIPE_PRICE_PROFISSIONAL: "price_p1",
    STRIPE_PRICE_PREMIUM: "price_x1",
  };
  const prod = { ...dev, NODE_ENV: "production", CLIENT_IP_SECRET: "c".repeat(32), INTERNAL_API_SECRET: "i".repeat(32), FRONTEND_URL: "https://marquo.com.br" };

  it("em desenvolvimento nada do Stripe é obrigatório (o backend local não cai no boot)", () => {
    expect(() => validateEnv(dev)).not.toThrow();
  });

  it("em produção falta qualquer variável do Stripe: o boot falha", () => {
    expect(() => validateEnv({ ...prod, ...stripe })).not.toThrow();
    expect(() => validateEnv(prod)).toThrow();
    for (const key of Object.keys(stripe)) {
      const { [key as keyof typeof stripe]: _removed, ...rest } = stripe;
      expect(() => validateEnv({ ...prod, ...rest })).toThrow();
    }
  });

  // Regressão de configuração: colar a chave PÚBLICA (pk_) no lugar da secreta, ou um id de
  // produto no lugar do price, passaria num "não vazio" e só quebraria na primeira cobrança.
  it("recusa chave e ids com o formato errado, mesmo em desenvolvimento", () => {
    expect(() => validateEnv({ ...dev, STRIPE_SECRET_KEY: "pk_test_abc" })).toThrow();
    expect(() => validateEnv({ ...dev, STRIPE_WEBHOOK_SECRET: "abc" })).toThrow();
    expect(() => validateEnv({ ...dev, STRIPE_PRICE_PREMIUM: "prod_abc" })).toThrow();
  });

  it("FRONTEND_URL é obrigatória em produção e, se vier, precisa ser uma URL http(s)", () => {
    const { FRONTEND_URL: _omit, ...withoutUrl } = prod;
    expect(() => validateEnv({ ...withoutUrl, ...stripe })).toThrow();
    expect(() => validateEnv({ ...dev, FRONTEND_URL: "http://localhost:3000" })).not.toThrow();
    expect(() => validateEnv({ ...dev, FRONTEND_URL: "javascript:alert(1)" })).toThrow();
    expect(() => validateEnv({ ...dev, FRONTEND_URL: "nao-e-url" })).toThrow();
  });
});

import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateEnv } from "./env.validation";

const base = {
  REDIS_URL: "redis://localhost:6379", DATABASE_URL: "postgresql://x",
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
      // Produção completa: além do CLIENT_IP_SECRET exige FRONTEND_URL e INTERNAL_API_SECRET.
      const prodComplete = {
        ...strong,
        NODE_ENV: "production",
        CLIENT_IP_SECRET: "c".repeat(32),
        INTERNAL_API_SECRET: "i".repeat(32),
        FRONTEND_URL: "https://marquo.com.br",
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
    };
    expect(() => validateEnv(prodNoInternal)).toThrow();
    expect(() => validateEnv({ ...prodNoInternal, INTERNAL_API_SECRET: "i".repeat(32) })).not.toThrow();
  });

  it("TRUST_PROXY_HOPS é opcional mas, se vier, precisa ser inteiro positivo", () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: "a".repeat(40), TRUST_PROXY_HOPS: "1" })).not.toThrow();
    expect(() => validateEnv({ ...base, JWT_SECRET: "a".repeat(40), TRUST_PROXY_HOPS: "0" })).toThrow();
  });
});

describe("validateEnv: FRONTEND_URL", () => {
  const dev = { REDIS_URL: "redis://localhost:6379", DATABASE_URL: "postgresql://x", JWT_SECRET: "a".repeat(40) };
  const prod = { ...dev, NODE_ENV: "production", CLIENT_IP_SECRET: "c".repeat(32), INTERNAL_API_SECRET: "i".repeat(32), FRONTEND_URL: "https://marquo.com.br" };

  it("em desenvolvimento nada de cobrança é obrigatório (o backend local não cai no boot)", () => {
    expect(() => validateEnv(dev)).not.toThrow();
  });

  it("produção completa sobe", () => {
    expect(() => validateEnv(prod)).not.toThrow();
  });

  it("FRONTEND_URL é obrigatória em produção e, se vier, precisa ser uma URL http(s)", () => {
    const { FRONTEND_URL: _omit, ...withoutUrl } = prod;
    expect(() => validateEnv(withoutUrl)).toThrow();
    expect(() => validateEnv({ ...dev, FRONTEND_URL: "http://localhost:3000" })).not.toThrow();
    expect(() => validateEnv({ ...dev, FRONTEND_URL: "javascript:alert(1)" })).toThrow();
    expect(() => validateEnv({ ...dev, FRONTEND_URL: "nao-e-url" })).toThrow();
  });

  describe("e-mail (RESEND_API_KEY + EMAIL_FROM)", () => {
    const strong = { ...base, JWT_SECRET: "a".repeat(40) };
    const key = "re_" + "k".repeat(24);

    it("é opcional: sem as variáveis o envio fica desligado", () => {
      expect(() => validateEnv(strong)).not.toThrow();
    });

    it("aceita a chave com remetente 'Nome <endereço>' ou só o endereço", () => {
      expect(() =>
        validateEnv({ ...strong, RESEND_API_KEY: key, EMAIL_FROM: "Marquo <avisos@marquo.com.br>" }),
      ).not.toThrow();
      expect(() => validateEnv({ ...strong, RESEND_API_KEY: key, EMAIL_FROM: "avisos@marquo.com.br" })).not.toThrow();
    });

    it("recusa uma sem a outra (config pela metade não pode subir)", () => {
      expect(() => validateEnv({ ...strong, RESEND_API_KEY: key })).toThrow();
      expect(() => validateEnv({ ...strong, EMAIL_FROM: "avisos@marquo.com.br" })).toThrow();
    });

    it("recusa chave com prefixo errado e remetente malformado ou com quebra de linha", () => {
      const from = "avisos@marquo.com.br";
      expect(() => validateEnv({ ...strong, RESEND_API_KEY: "sk_" + "k".repeat(24), EMAIL_FROM: from })).toThrow();
      expect(() => validateEnv({ ...strong, RESEND_API_KEY: key, EMAIL_FROM: "sem-arroba" })).toThrow();
      expect(() => validateEnv({ ...strong, RESEND_API_KEY: key, EMAIL_FROM: `${from}\nBcc: x@y.com` })).toThrow();
    });
  });

  describe("2FA da plataforma (PLATFORM_ADMIN_2FA)", () => {
    const strong = { ...base, JWT_SECRET: "a".repeat(40) };
    const hash = "$2b$12$" + "a".repeat(53);
    const admin = { PLATFORM_ADMIN_EMAIL: "admin@marquo.com.br", PLATFORM_ADMIN_PASSWORD_HASH: hash };
    const mail = { RESEND_API_KEY: "re_" + "k".repeat(24), EMAIL_FROM: "avisos@marquo.com.br" };

    it("é opcional: desligado por padrão", () => {
      expect(() => validateEnv({ ...strong, ...admin })).not.toThrow();
    });

    it("ligado com conta da plataforma e e-mail configurados, sobe", () => {
      expect(() => validateEnv({ ...strong, ...admin, ...mail, PLATFORM_ADMIN_2FA: "email" })).not.toThrow();
    });

    // Ligar o 2FA sem como entregar o código trancaria o admin para fora: tem que falhar no boot.
    it("ligado sem e-mail configurado, sem conta ou sem hash: recusa subir (fail closed)", () => {
      expect(() => validateEnv({ ...strong, ...admin, PLATFORM_ADMIN_2FA: "email" })).toThrow(/RESEND_API_KEY/);
      expect(() => validateEnv({ ...strong, ...mail, PLATFORM_ADMIN_2FA: "email" })).toThrow(/PLATFORM_ADMIN_EMAIL/);
    });

    it("só aceita o valor 'email'", () => {
      expect(() => validateEnv({ ...strong, ...admin, ...mail, PLATFORM_ADMIN_2FA: "sms" })).toThrow();
      expect(() => validateEnv({ ...strong, ...admin, ...mail, PLATFORM_ADMIN_2FA: "true" })).toThrow();
    });
  });

  describe("conta da plataforma (PLATFORM_ADMIN_*)", () => {
    const strong = { ...base, JWT_SECRET: "a".repeat(40) };
    const hash = "$2b$12$" + "a".repeat(53);

    it("é opcional: sem as variáveis o painel fica desligado", () => {
      expect(() => validateEnv(strong)).not.toThrow();
    });

    it("aceita e-mail + hash bcrypt", () => {
      expect(() =>
        validateEnv({ ...strong, PLATFORM_ADMIN_EMAIL: "admin@marquo.com.br", PLATFORM_ADMIN_PASSWORD_HASH: hash }),
      ).not.toThrow();
    });

    it("recusa uma sem a outra (config pela metade não pode subir)", () => {
      expect(() => validateEnv({ ...strong, PLATFORM_ADMIN_EMAIL: "admin@marquo.com.br" })).toThrow();
      expect(() => validateEnv({ ...strong, PLATFORM_ADMIN_PASSWORD_HASH: hash })).toThrow();
    });

    // Regressão de segurança: colar a senha em claro no lugar do hash não pode subir calado.
    it("recusa senha em texto puro no lugar do hash", () => {
      expect(() =>
        validateEnv({ ...strong, PLATFORM_ADMIN_EMAIL: "admin@marquo.com.br", PLATFORM_ADMIN_PASSWORD_HASH: "SenhaForte123!" }),
      ).toThrow();
    });

    it("recusa e-mail inválido", () => {
      expect(() =>
        validateEnv({ ...strong, PLATFORM_ADMIN_EMAIL: "nao-e-email", PLATFORM_ADMIN_PASSWORD_HASH: hash }),
      ).toThrow();
    });
  });
});

it("requires a valid shared Redis URL", () => {
  expect(() => validateEnv({ DATABASE_URL: "postgresql://x", JWT_SECRET: "x".repeat(40) })).toThrow();
  expect(() => validateEnv({ DATABASE_URL: "postgresql://x", JWT_SECRET: "x".repeat(40), REDIS_URL: "https://example.com" })).toThrow();
});

describe("validateEnv: variável em branco (CHAVE=) vale como não definida", () => {
  const strong = { REDIS_URL: "redis://localhost:6379", DATABASE_URL: "postgresql://x", JWT_SECRET: "a".repeat(40) };
  const blanks = {
    SITE_URL: "",
    TRUST_PROXY_HOPS: "",
    CLIENT_IP_SECRET: "",
    INTERNAL_API_SECRET: "",
    ASAAS_API_KEY: "",
    ASAAS_WEBHOOK_TOKEN: "",
    PLATFORM_ADMIN_EMAIL: "",
    PLATFORM_ADMIN_PASSWORD_HASH: "",
    PLATFORM_ADMIN_2FA: "",
    RESEND_API_KEY: "",
    EMAIL_FROM: "",
  };

  it("o .env.example completo (opcionais em branco) sobe em desenvolvimento", () => {
    expect(() => validateEnv({ ...strong, ...blanks })).not.toThrow();
  });

  it("espaços sozinhos também contam como em branco", () => {
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: "   ", RESEND_API_KEY: "\t" })).not.toThrow();
  });

  it("o par do Resend em branco não exige o outro (não liga e-mail com valor falso)", () => {
    const result = validateEnv({ ...strong, RESEND_API_KEY: "", EMAIL_FROM: "" });
    expect(result.RESEND_API_KEY).toBeUndefined();
    expect(result.EMAIL_FROM).toBeUndefined();
  });

  it("a variável em branco é removida do process.env (o ConfigService não devolve string vazia)", () => {
    process.env.ASAAS_API_KEY = "";
    validateEnv({ ...strong, ASAAS_API_KEY: "" });
    expect(process.env.ASAAS_API_KEY).toBeUndefined();
  });

  it("obrigatória em branco continua falhando (JWT_SECRET, DATABASE_URL, REDIS_URL)", () => {
    expect(() => validateEnv({ ...strong, JWT_SECRET: "" })).toThrow();
    expect(() => validateEnv({ ...strong, DATABASE_URL: "" })).toThrow();
    expect(() => validateEnv({ ...strong, REDIS_URL: "" })).toThrow();
  });

  it("em produção, segredo obrigatório em branco falha como se estivesse ausente", () => {
    const prod = {
      ...strong,
      NODE_ENV: "production",
      CLIENT_IP_SECRET: "c".repeat(32),
      INTERNAL_API_SECRET: "i".repeat(32),
      FRONTEND_URL: "https://marquo.com.br",
    };
    expect(() => validateEnv(prod)).not.toThrow();
    expect(() => validateEnv({ ...prod, CLIENT_IP_SECRET: "" })).toThrow();
    expect(() => validateEnv({ ...prod, INTERNAL_API_SECRET: "" })).toThrow();
  });

  const sandboxKey = "$aact_hmlg_" + "a".repeat(40);
  const prodKey = "$aact_prod_" + "b".repeat(40);
  const prod = {
    ...strong,
    NODE_ENV: "production",
    CLIENT_IP_SECRET: "c".repeat(32),
    INTERNAL_API_SECRET: "i".repeat(32),
    FRONTEND_URL: "https://marquo.com.br",
  };

  it("ASAAS_API_KEY: aceita chave de sandbox e de produção; recusa prefixo errado (chave de outro provedor, texto solto)", () => {
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: sandboxKey })).not.toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: prodKey })).not.toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: "qualquer-coisa" })).toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: "APP_USR-1234567890abcdef" })).toThrow();
    // `$` expandido pelo shell some e deixa só um pedaço: não pode passar.
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: "aact_prod_" + "b".repeat(40) })).toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: "$aact_prod_curta" })).toThrow();
  });

  it("ASAAS_WEBHOOK_TOKEN: 32 a 255 caracteres; em produção, com a chave, é obrigatório", () => {
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: sandboxKey, ASAAS_WEBHOOK_TOKEN: "t".repeat(32) })).not.toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: sandboxKey, ASAAS_WEBHOOK_TOKEN: "curto" })).toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: sandboxKey, ASAAS_WEBHOOK_TOKEN: "t".repeat(256) })).toThrow();
    // Em desenvolvimento sem token o boot passa (o webhook nem chega sem túnel); em produção não.
    expect(() => validateEnv({ ...strong, ASAAS_API_KEY: sandboxKey })).not.toThrow();
    expect(() => validateEnv({ ...prod, ASAAS_API_KEY: prodKey })).toThrow();
    expect(() => validateEnv({ ...prod, ASAAS_API_KEY: prodKey, ASAAS_WEBHOOK_TOKEN: "t".repeat(40) })).not.toThrow();
    // Sem a chave, produção sobe (cobrança desligada).
    expect(() => validateEnv(prod)).not.toThrow();
  });

  it("ASAAS_BACK_URL_BASE só aceita https (o Asaas recusa http/localhost como successUrl)", () => {
    expect(() => validateEnv({ ...strong, ASAAS_BACK_URL_BASE: "https://abc.ngrok-free.app" })).not.toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_BACK_URL_BASE: "http://localhost:3000" })).toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_BACK_URL_BASE: "" })).not.toThrow();
  });

  it("valor preenchido continua sendo validado (URL de teste inválida falha)", () => {
    expect(() => validateEnv({ ...strong, ASAAS_API_BASE: "nao-e-url" })).toThrow();
    expect(() => validateEnv({ ...strong, ASAAS_API_BASE: "http://localhost:4010" })).not.toThrow();
  });
});

describe("arquivo de exemplo de ambiente da raiz", () => {
  const raw = readFileSync(join(__dirname, "../../../../.env.example"), "utf8");
  // Leitor mínimo (linhas CHAVE=valor; ignora comentários e linhas em branco; tira aspas): o suficiente para o arquivo de exemplo.
  const parsed: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) parsed[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }

  it("copiado do jeito que está, o backend sobe (o que não é preenchido fica desligado)", () => {
    expect(() => validateEnv({ ...parsed })).not.toThrow();
  });

  it("não deixa variável de configuração comentada: toda chave da validação aparece ativa", () => {
    for (const key of [
      "REDIS_URL", "DATABASE_URL", "JWT_SECRET", "JWT_EXPIRES_IN", "PORT", "FRONTEND_URL", "SITE_URL", "TRUST_PROXY_HOPS",
      "CLIENT_IP_SECRET", "INTERNAL_API_SECRET", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN", "ASAAS_BACK_URL_BASE",
      "PLATFORM_ADMIN_EMAIL", "PLATFORM_ADMIN_PASSWORD_HASH", "PLATFORM_ADMIN_2FA", "RESEND_API_KEY", "EMAIL_FROM",
    ]) {
      expect(Object.keys(parsed)).toContain(key);
    }
  });

  it("não traz segredo de verdade: valores preenchidos são só os de desenvolvimento/placeholder", () => {
    expect(parsed.JWT_SECRET).toMatch(/^CHANGE_ME/);
    for (const key of ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN", "ASAAS_BACK_URL_BASE", "RESEND_API_KEY", "PLATFORM_ADMIN_PASSWORD_HASH", "INTERNAL_API_SECRET", "CLIENT_IP_SECRET"]) {
      expect(parsed[key]).toBe("");
    }
  });
});


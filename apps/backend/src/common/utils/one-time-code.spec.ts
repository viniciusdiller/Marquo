import { generateNumericCode, oneTimeCodeSecret, OneTimeCodeStore } from "./one-time-code";

const OPTIONS = { ttlMs: 10 * 60_000, maxAttempts: 3, maxEntries: 3 };
const secret = oneTimeCodeSecret("s".repeat(40));
const T0 = 1_000_000;

describe("generateNumericCode", () => {
  it("gera 6 dígitos, com zeros à esquerda quando preciso", () => {
    for (let i = 0; i < 200; i++) expect(generateNumericCode()).toMatch(/^\d{6}$/);
  });

  it("não repete sempre o mesmo valor (usa aleatoriedade de verdade)", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateNumericCode()));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe("oneTimeCodeSecret", () => {
  it("é derivado e diferente do JWT_SECRET", () => {
    const jwt = "x".repeat(40);
    expect(oneTimeCodeSecret(jwt)).not.toBe(jwt);
    expect(oneTimeCodeSecret(jwt)).toBe(oneTimeCodeSecret(jwt));
    expect(oneTimeCodeSecret(jwt)).not.toBe(oneTimeCodeSecret("y".repeat(40)));
  });
});

describe("OneTimeCodeStore", () => {
  it("aceita o código certo e só ele", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const code = store.issue("a@x.com", T0);
    expect(store.check("a@x.com", code, T0 + 1)).toBe("ok");
    const wrong = code === "000000" ? "000001" : "000000";
    expect(store.check("a@x.com", wrong, T0 + 1)).toBe("invalid");
  });

  it("o código de uma chave não vale para outra", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const code = store.issue("a@x.com", T0);
    store.issue("b@x.com", T0);
    expect(store.check("b@x.com", code, T0)).not.toBe("ok");
  });

  it("expira depois do prazo", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const code = store.issue("a@x.com", T0);
    expect(store.check("a@x.com", code, T0 + OPTIONS.ttlMs + 1)).toBe("expired");
    expect(store.size).toBe(0);
  });

  it("trava depois de erros demais e descarta o código (mesmo o certo deixa de valer)", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const code = store.issue("a@x.com", T0);
    const wrong = code === "123456" ? "654321" : "123456";
    expect(store.check("a@x.com", wrong, T0)).toBe("invalid");
    expect(store.check("a@x.com", wrong, T0)).toBe("invalid");
    expect(store.check("a@x.com", wrong, T0)).toBe("locked");
    expect(store.check("a@x.com", code, T0)).toBe("expired");
  });

  it("é de uso único: consume() invalida o código", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const code = store.issue("a@x.com", T0);
    store.consume("a@x.com");
    expect(store.check("a@x.com", code, T0)).toBe("expired");
  });

  it("emitir de novo invalida o código anterior e zera as tentativas", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const first = store.issue("a@x.com", T0);
    const second = store.issue("a@x.com", T0 + 1);
    if (first !== second) expect(store.check("a@x.com", first, T0 + 2)).toBe("invalid");
    expect(store.check("a@x.com", second, T0 + 2)).toBe("ok");
  });

  it("não guarda o código em claro", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    const code = store.issue("a@x.com", T0);
    expect(JSON.stringify([...(store as unknown as { entries: Map<string, unknown> }).entries])).not.toContain(`"${code}"`);
  });

  it("intervalo mínimo entre pedidos (waitMs)", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    expect(store.waitMs("a@x.com", 60_000, T0)).toBe(0);
    store.issue("a@x.com", T0);
    expect(store.waitMs("a@x.com", 60_000, T0 + 10_000)).toBe(50_000);
    expect(store.waitMs("a@x.com", 60_000, T0 + 61_000)).toBe(0);
  });

  it("limita o total de códigos vivos (descarta os mais antigos) e limpa os vencidos", () => {
    const store = new OneTimeCodeStore(secret, OPTIONS);
    for (const key of ["1", "2", "3", "4", "5"]) store.issue(key, T0);
    expect(store.size).toBe(3);
    store.issue("6", T0 + OPTIONS.ttlMs + 1);
    expect(store.size).toBe(1);
  });
});

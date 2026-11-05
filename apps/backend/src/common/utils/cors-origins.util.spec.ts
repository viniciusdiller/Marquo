import { corsOrigins, devLanOrigins } from "./cors-origins.util";

describe("corsOrigins", () => {
  it("usa localhost:3000 por padrão em desenvolvimento", () => {
    expect(corsOrigins({})).toEqual(["http://localhost:3000"]);
  });

  it("acrescenta o site institucional e reduz cada URL à origem (sem barra final nem caminho)", () => {
    expect(corsOrigins({ FRONTEND_URL: "https://app.marquo.com.br/", SITE_URL: "https://totalsoftware.com.br/planos" })).toEqual([
      "https://app.marquo.com.br",
      "https://totalsoftware.com.br",
    ]);
  });

  it("não duplica quando as duas são a mesma origem", () => {
    expect(corsOrigins({ FRONTEND_URL: "https://x.com", SITE_URL: "https://x.com/y" })).toEqual(["https://x.com"]);
  });

  // Nunca abrir a porta para valor estranho: lixo é ignorado, não vira "*" nem entra na lista.
  it("ignora valor inválido e nunca devolve curinga", () => {
    const origins = corsOrigins({ FRONTEND_URL: "https://x.com", SITE_URL: "não é url" });
    expect(origins).toEqual(["https://x.com"]);
    expect(origins).not.toContain("*");
  });
});

// Só para abrir o site pelo celular em desenvolvimento (pnpm dev:lan). Nunca em produção, nunca host público.
describe("devLanOrigins", () => {
  const allowed = (origin: string, env: { NODE_ENV?: string } = {}) => devLanOrigins(env).some((re) => re.test(origin));

  it("libera o IP da rede local em http (as três faixas privadas, qualquer porta do site)", () => {
    for (const origin of ["http://192.168.3.71:3000", "http://10.0.0.5:3000", "http://172.16.0.2:3000", "http://172.31.255.1:3002"]) {
      expect(allowed(origin)).toBe(true);
    }
  });

  it("NÃO libera host público, https, 172 fora da faixa, nem texto colado antes/depois", () => {
    for (const origin of [
      "http://200.10.20.30:3000",
      "https://192.168.3.71:3000",
      "http://172.32.0.1:3000",
      "http://192.168.3.71",
      "http://192.168.3.71:3000.evil.com",
      "http://evil.com/http://192.168.3.71:3000",
      "http://192.168.3.71.evil.com:3000",
      "http://localhost:3000",
    ]) {
      expect(allowed(origin)).toBe(false);
    }
  });

  it("em produção não libera nada", () => {
    expect(devLanOrigins({ NODE_ENV: "production" })).toEqual([]);
    expect(allowed("http://192.168.3.71:3000", { NODE_ENV: "production" })).toBe(false);
  });
});

import { corsOrigins } from "./cors-origins.util";

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

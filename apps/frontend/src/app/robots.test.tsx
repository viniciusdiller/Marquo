import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("permite raiz pública e bloqueia rotas privadas/sensíveis", () => {
    const config = robots();
    expect(config.sitemap).toBe("https://marquo.com.br/sitemap.xml");

    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/dashboard/",
        "/plataforma",
        "/plataforma/",
        "/minha-conta",
        "/minha-conta/",
        "/api/",
        "/definir-senha",
        "/esqueci-senha",
        "/verificar-email",
      ]),
    );
  });
});


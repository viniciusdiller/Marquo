import { describe, expect, it } from "vitest";
import { absoluteLogoUrl } from "./logo-url";

describe("absoluteLogoUrl", () => {
  it("caminho da API vira endereço completo da API (sem barra dupla)", () => {
    expect(absoluteLogoUrl("/uploads/tenants/t1/logo.webp", undefined, "https://api.marquo.com.br/")).toBe(
      "https://api.marquo.com.br/uploads/tenants/t1/logo.webp",
    );
  });
  it("versão entra como ?v= para o cache das prévias trocar quando a logo muda", () => {
    expect(absoluteLogoUrl("/uploads/l.webp", "2026-11-22T10:00:00.000Z", "https://api.x")).toBe(
      "https://api.x/uploads/l.webp?v=2026-11-22T10%3A00%3A00.000Z",
    );
  });
  it("sem logo não gera imagem; URL já absoluta é mantida", () => {
    expect(absoluteLogoUrl(null)).toBeUndefined();
    expect(absoluteLogoUrl("https://cdn.x/l.png", undefined, "https://api.x")).toBe("https://cdn.x/l.png");
  });
});

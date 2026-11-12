import { describe, expect, it, vi, beforeEach } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna as rotas públicas essenciais incluindo termos e privacidade", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
    } as Response);

    const result = await sitemap();
    const urls = result.map((item) => item.url);

    expect(urls).toContain("https://marquo.com.br");
    expect(urls).toContain("https://marquo.com.br/descobrir");
    expect(urls).toContain("https://marquo.com.br/para-donos");
    expect(urls).toContain("https://marquo.com.br/termos");
    expect(urls).toContain("https://marquo.com.br/privacidade");
  });

  it("anexa os estabelecimentos retornados pela API pública", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ slug: "barbearia-vintage" }, { slug: "salao-elegance" }],
    } as Response);

    const result = await sitemap();
    const urls = result.map((item) => item.url);

    expect(urls).toContain("https://marquo.com.br/barbearia-vintage");
    expect(urls).toContain("https://marquo.com.br/salao-elegance");
  });
});


import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const backendFetch = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/backend-fetch", () => ({ backendFetch: (...args: unknown[]) => backendFetch(...args) }));

import { GET } from "./route";

const ownerSession = { accessToken: "tok", user: { role: "OWNER" } };

describe("GET /dashboard/configuracoes/exportar", () => {
  beforeEach(() => {
    auth.mockReset();
    backendFetch.mockReset();
  });

  it("sem sessão: 401 e não chama a API", async () => {
    auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it("sessão com erro de renovação: 401", async () => {
    auth.mockResolvedValue({ ...ownerSession, error: "RefreshAccessTokenError" });
    expect((await GET()).status).toBe(401);
  });

  it("recepção ou profissional: 403 e não chama a API", async () => {
    for (const role of ["RECEPTIONIST", "PROFESSIONAL"]) {
      auth.mockResolvedValue({ accessToken: "tok", user: { role } });
      expect((await GET()).status).toBe(403);
    }
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it("dono: repassa o arquivo em streaming como anexo, com o token da sessão", async () => {
    auth.mockResolvedValue(ownerSession);
    backendFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-disposition": 'attachment; filename="marquo-dados-salao-2026-10-22.json"' },
      }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0][0]).toMatch(/\/export\/data$/);
    expect(backendFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="marquo-dados-salao-2026-10-22.json"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe('{"ok":true}');
  });

  it("nome de arquivo vindo do backend fora do padrão seguro é trocado pelo padrão", async () => {
    auth.mockResolvedValue(ownerSession);
    backendFetch.mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-disposition": 'attachment; filename="../../etc/passwd"' } }),
    );
    expect((await GET()).headers.get("content-disposition")).toBe('attachment; filename="marquo-dados.json"');
  });

  it("limite de uso (429) e exportação em andamento (409) viram mensagens claras", async () => {
    auth.mockResolvedValue(ownerSession);
    backendFetch.mockResolvedValue(new Response("x", { status: 429 }));
    const limited = await GET();
    expect(limited.status).toBe(429);
    expect(await limited.text()).toMatch(/aguarde/i);

    backendFetch.mockResolvedValue(new Response("x", { status: 409 }));
    expect((await GET()).status).toBe(409);
  });

  it("falha do backend ou da rede: 502 sem vazar o erro", async () => {
    auth.mockResolvedValue(ownerSession);
    backendFetch.mockResolvedValue(new Response("stack trace secreta", { status: 500 }));
    const failed = await GET();
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("stack trace");

    backendFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await GET()).status).toBe(502);
  });
});

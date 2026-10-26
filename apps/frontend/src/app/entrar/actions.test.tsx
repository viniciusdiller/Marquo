import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
const backendFetch = vi.fn();
const consumerPublicFetch = vi.fn();
const platformPublicFetch = vi.fn();

vi.mock("next-auth", () => {
  class AuthError extends Error {
    code?: string;
  }
  class CredentialsSignin extends AuthError {}
  return { AuthError, CredentialsSignin };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("@/lib/backend-fetch", () => ({ backendFetch: (...args: unknown[]) => backendFetch(...args) }));
vi.mock("@/lib/consumer-session", () => ({
  consumerPublicFetch: (...args: unknown[]) => consumerPublicFetch(...args),
  setConsumerToken: vi.fn(),
}));
vi.mock("@/lib/platform-session", () => ({
  platformPublicFetch: (...args: unknown[]) => platformPublicFetch(...args),
  setPlatformToken: vi.fn(),
}));

import { AuthError } from "next-auth";
import { ApiError } from "@/lib/api";
import { loginAction, requestRegisterCodeAction, resendVerificationAction, verifyPlatformCodeAction } from "./actions";
import { setPlatformToken } from "@/lib/platform-session";

function authError(code?: string) {
  const error = new AuthError("x");
  (error as { code?: string }).code = code;
  return error;
}

describe("loginAction: e-mail não confirmado", () => {
  beforeEach(() => {
    signIn.mockReset();
    consumerPublicFetch.mockReset();
    platformPublicFetch.mockReset();
    consumerPublicFetch.mockRejectedValue(new ApiError("Credenciais inválidas.", 401));
    platformPublicFetch.mockRejectedValue(new ApiError("E-mail ou senha incorretos.", 401));
  });

  it("senha certa de conta sem confirmação: devolve a mensagem e o código, sem tentar plataforma nem cliente", async () => {
    signIn.mockRejectedValue(authError("email_not_verified"));

    const result = await loginAction("dono@salao.com", "senha-certa-123");

    expect(result).toEqual({
      error: expect.stringMatching(/confirme seu e-mail/i),
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(platformPublicFetch).not.toHaveBeenCalled();
    expect(consumerPublicFetch).not.toHaveBeenCalled();
  });

  it("senha errada continua sendo a mensagem genérica, SEM código (não vira oráculo de conta existente)", async () => {
    signIn.mockRejectedValue(authError("credentials"));

    const result = await loginAction("dono@salao.com", "errada");

    expect(result).toEqual({ error: "E-mail/telefone ou senha incorretos." });
    expect(result).not.toHaveProperty("code");
  });

  it("erro de AuthError sem código também cai no genérico", async () => {
    signIn.mockRejectedValue(authError(undefined));
    expect(await loginAction("dono@salao.com", "x")).toEqual({ error: "E-mail/telefone ou senha incorretos." });
  });

  it("login certo de conta confirmada segue para o painel", async () => {
    signIn.mockResolvedValue("http://localhost/dashboard");
    expect(await loginAction("dono@salao.com", "ok-123456")).toEqual({ redirectTo: "/dashboard/agenda" });
  });

  it("erro que não é do Auth.js não é engolido", async () => {
    signIn.mockRejectedValue(new Error("falha de rede inesperada"));
    await expect(loginAction("dono@salao.com", "x")).rejects.toThrow("falha de rede inesperada");
  });

  it("telefone nunca tenta o login de staff (não pode ativar o fluxo de confirmação)", async () => {
    consumerPublicFetch.mockResolvedValue({ accessToken: "t" });
    await loginAction("11912345678", "senha");
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("resendVerificationAction", () => {
  beforeEach(() => {
    backendFetch.mockReset();
  });

  it("envia o e-mail normalizado ao backend", async () => {
    backendFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(resendVerificationAction("  Dono@Salao.COM ")).resolves.toEqual({ ok: true });
    expect(backendFetch.mock.calls[0][0]).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(backendFetch.mock.calls[0][1].body)).toEqual({ email: "dono@salao.com" });
  });

  it("recusa e-mail vazio ou sem @ antes de chamar o backend", async () => {
    expect(await resendVerificationAction("")).toMatchObject({ ok: false });
    expect(await resendVerificationAction("sem-arroba")).toMatchObject({ ok: false });
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it("traduz o limite de tentativas (429) e falhas do servidor", async () => {
    backendFetch.mockResolvedValue(new Response("x", { status: 429 }));
    expect(await resendVerificationAction("a@x.com")).toMatchObject({ ok: false, error: expect.stringMatching(/muitas tentativas/i) });

    backendFetch.mockResolvedValue(new Response("x", { status: 500 }));
    expect(await resendVerificationAction("a@x.com")).toMatchObject({ ok: false });
  });

  it("falha de rede vira mensagem, sem propagar o erro", async () => {
    backendFetch.mockRejectedValue(new Error("rede"));
    expect(await resendVerificationAction("a@x.com")).toMatchObject({ ok: false, error: expect.stringMatching(/erro inesperado/i) });
  });
});

describe("loginAction: conta da plataforma com 2FA", () => {
  beforeEach(() => {
    signIn.mockReset();
    consumerPublicFetch.mockReset();
    platformPublicFetch.mockReset();
    vi.mocked(setPlatformToken).mockReset();
    signIn.mockRejectedValue(authError("credentials"));
    consumerPublicFetch.mockRejectedValue(new ApiError("Credenciais inválidas.", 401));
  });

  it("senha certa com 2FA: pede o código (sem sessão, sem cookie, sem tentar o login de cliente)", async () => {
    platformPublicFetch.mockResolvedValue({ requiresCode: true, challengeId: "ab".repeat(24) });

    const result = await loginAction("admin@marquo.com.br", "senha-da-plataforma");

    expect(result).toEqual({ needsCode: true, challengeId: "ab".repeat(24) });
    expect(setPlatformToken).not.toHaveBeenCalled();
    expect(consumerPublicFetch).not.toHaveBeenCalled();
  });

  it("2FA desligado: login direto grava o cookie e vai para a plataforma (comportamento anterior)", async () => {
    platformPublicFetch.mockResolvedValue({ accessToken: "jwt", expiresInSeconds: 7200 });

    expect(await loginAction("admin@marquo.com.br", "senha")).toEqual({ redirectTo: "/plataforma" });
    expect(setPlatformToken).toHaveBeenCalledWith("jwt", 7200);
  });

  it("código não enviado (503): avisa que não foi possível enviar, em vez de 'senha incorreta'", async () => {
    platformPublicFetch.mockRejectedValue(new ApiError("indisponível", 503));
    const result = await loginAction("admin@marquo.com.br", "senha");
    expect(result).toEqual({ error: expect.stringMatching(/enviar o código/i) });
  });

  it("senha errada da plataforma continua indistinguível (cai no login de cliente e no erro genérico)", async () => {
    platformPublicFetch.mockRejectedValue(new ApiError("E-mail ou senha incorretos.", 401));
    expect(await loginAction("admin@marquo.com.br", "errada")).toEqual({ error: "E-mail/telefone ou senha incorretos." });
    expect(consumerPublicFetch).toHaveBeenCalled();
  });
});

describe("verifyPlatformCodeAction", () => {
  beforeEach(() => {
    platformPublicFetch.mockReset();
    vi.mocked(setPlatformToken).mockReset();
  });

  it("código certo: grava o cookie no servidor e manda para a plataforma", async () => {
    platformPublicFetch.mockResolvedValue({ accessToken: "jwt", expiresInSeconds: 7200 });

    expect(await verifyPlatformCodeAction("ab".repeat(24), "042913")).toEqual({ redirectTo: "/plataforma" });

    expect(setPlatformToken).toHaveBeenCalledWith("jwt", 7200);
    expect(platformPublicFetch.mock.calls[0][0]).toBe("/platform/auth/verify");
    expect(JSON.parse(platformPublicFetch.mock.calls[0][1].body)).toEqual({ challengeId: "ab".repeat(24), code: "042913" });
  });

  it("aceita o código com espaços (colado do e-mail) e recusa o que não tem 6 dígitos sem chamar o backend", async () => {
    platformPublicFetch.mockResolvedValue({ accessToken: "jwt", expiresInSeconds: 7200 });
    await verifyPlatformCodeAction("ab".repeat(24), "042 913");
    expect(JSON.parse(platformPublicFetch.mock.calls[0][1].body).code).toBe("042913");

    platformPublicFetch.mockClear();
    expect(await verifyPlatformCodeAction("ab".repeat(24), "12345")).toEqual({ error: expect.stringMatching(/6 dígitos/i) });
    expect(await verifyPlatformCodeAction("ab".repeat(24), "abcdef")).toEqual({ error: expect.stringMatching(/6 dígitos/i) });
    expect(platformPublicFetch).not.toHaveBeenCalled();
  });

  it("código errado ou vencido: mensagem genérica, sem cookie, e oferece recomeçar", async () => {
    platformPublicFetch.mockRejectedValue(new ApiError("Código inválido ou expirado.", 401));
    const result = await verifyPlatformCodeAction("ab".repeat(24), "111111");
    expect(result).toEqual({ error: expect.stringMatching(/inválido ou expirado/i), restart: true });
    expect(setPlatformToken).not.toHaveBeenCalled();
  });

  it("limite de tentativas (429) tem mensagem própria", async () => {
    platformPublicFetch.mockRejectedValue(new ApiError("x", 429));
    expect(await verifyPlatformCodeAction("ab".repeat(24), "111111")).toEqual({ error: expect.stringMatching(/muitas tentativas/i) });
  });
});

describe("requestRegisterCodeAction", () => {
  beforeEach(() => {
    backendFetch.mockReset();
  });

  it("envia o e-mail normalizado e devolve se o código é exigido", async () => {
    backendFetch.mockResolvedValue(new Response(JSON.stringify({ required: true }), { status: 200 }));
    expect(await requestRegisterCodeAction("  Ana@Example.COM ")).toEqual({ ok: true, required: true });
    expect(backendFetch.mock.calls[0][0]).toMatch(/\/public\/consumer\/register\/code$/);
    expect(JSON.parse(backendFetch.mock.calls[0][1].body)).toEqual({ email: "ana@example.com" });
  });

  it("sistema sem e-mail (required: false) pula a etapa", async () => {
    backendFetch.mockResolvedValue(new Response(JSON.stringify({ required: false }), { status: 200 }));
    expect(await requestRegisterCodeAction("a@x.com")).toEqual({ ok: true, required: false });
  });

  it("recusa e-mail inválido sem chamar o backend", async () => {
    expect(await requestRegisterCodeAction("sem-arroba")).toMatchObject({ ok: false });
    expect(await requestRegisterCodeAction("")).toMatchObject({ ok: false });
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it("traduz 429, 503 e falhas de rede", async () => {
    backendFetch.mockResolvedValue(new Response("x", { status: 429 }));
    expect(await requestRegisterCodeAction("a@x.com")).toMatchObject({ ok: false, error: expect.stringMatching(/muitos pedidos/i) });

    backendFetch.mockResolvedValue(new Response("x", { status: 503 }));
    expect(await requestRegisterCodeAction("a@x.com")).toMatchObject({ ok: false, error: expect.stringMatching(/mais tarde/i) });

    backendFetch.mockRejectedValue(new Error("rede"));
    expect(await requestRegisterCodeAction("a@x.com")).toMatchObject({ ok: false });
  });
});

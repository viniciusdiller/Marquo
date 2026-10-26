"use server";

import { AuthError } from "next-auth";
import { isSafeRedirectPath } from "@/lib/safe-path";
import { headers } from "next/headers";
import type { ConsumerSession } from "@marquo/shared-types";
import { ApiError } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { backendFetch } from "@/lib/backend-fetch";
import { EMAIL_NOT_VERIFIED_AUTH_CODE } from "@/lib/auth-errors";
import { consumerPublicFetch, setConsumerToken } from "@/lib/consumer-session";
import { platformPublicFetch, setPlatformToken } from "@/lib/platform-session";

// consumerPublicFetch roda no servidor: sem isso, o backend veria o User-Agent da chamada
// fetch() do Next (algo como "node"), não o do navegador de quem está logando — a lista de
// "Dispositivos conectados" mostraria "node" pra todo mundo em vez de "Chrome, Windows".
async function browserUserAgent(): Promise<string | undefined> {
  return (await headers()).get("user-agent") ?? undefined;
}

// `code` só aparece quando a falha tem uma ação possível para o usuário (hoje: conta que falta confirmar o e-mail).
export type LoginResult =
  | { redirectTo: string }
  | { error: string; code?: "EMAIL_NOT_VERIFIED" }
  // Conta da plataforma com 2FA: a senha estava certa e o código foi enviado por e-mail; a tela pede o código.
  | { needsCode: true; challengeId: string };

const GENERIC_LOGIN_ERROR = "E-mail/telefone ou senha incorretos.";
const EMAIL_NOT_VERIFIED_MESSAGE = "Confirme seu e-mail para entrar. Enviamos um link para o endereço do cadastro.";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// `next` vem da query string (controlada por quem montou o link): ver lib/safe-path.ts.
const isSafePath = isSafeRedirectPath;

function clientDestination(next: string | undefined) {
  return isSafePath(next) ? next : "/descobrir";
}

// Dono/staff só volta pra dentro do dashboard; qualquer outro `next` (ex.: veio de uma página
// de salão) é ignorado.
function staffDestination(next: string | undefined) {
  return isSafePath(next) && next.startsWith("/dashboard") ? next : "/dashboard/agenda";
}

// "unverified" só chega aqui quando a senha estava CERTA (o backend barra o login e avisa que falta confirmar o e-mail).
type StaffLogin = "ok" | "unverified" | "fail";

async function tryStaffLogin(email: string, password: string): Promise<StaffLogin> {
  try {
    // redirect: false em vez de redirectTo: o signIn() do next-auth v5 constrói a URL de
    // redirect internamente (createActionURL) e essa construção trava a navegação no Next.js 16
    // (nextauthjs/next-auth#13388) — a sessão é criada certinho, mas o browser nunca navega.
    // O redirecionamento é feito pelo cliente com o `redirectTo` devolvido.
    const result = await signIn("credentials", { email, password, redirect: false });
    return result?.error ? "fail" : "ok";
  } catch (error) {
    if (error instanceof AuthError) {
      return (error as { code?: string }).code === EMAIL_NOT_VERIFIED_AUTH_CODE ? "unverified" : "fail";
    }
    throw error;
  }
}

// Conta da plataforma (painel de gestão da empresa). Definida no .env do backend, não existe no banco.
// Roda DEPOIS do staff e ANTES do cliente: dono/staff que acerta a senha nunca paga esta chamada extra,
// e um e-mail de staff que coincida com o da plataforma não a sequestra (precisa da senha do .env).
type PlatformLogin =
  | { kind: "ok" }
  | { kind: "code"; challengeId: string }
  | { kind: "unavailable" }
  | { kind: "fail" };

async function tryPlatformLogin(email: string, password: string): Promise<PlatformLogin> {
  try {
    const session = await platformPublicFetch<
      { accessToken: string; expiresInSeconds: number } | { requiresCode: true; challengeId: string }
    >("/platform/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

    // Com 2FA ligado a senha certa não entrega sessão: devolve um desafio e o código segue por e-mail.
    if ("requiresCode" in session) return { kind: "code", challengeId: session.challengeId };

    await setPlatformToken(session.accessToken, session.expiresInSeconds);
    return { kind: "ok" };
  } catch (error) {
    // 503 só acontece com a senha CERTA (o código não pôde ser enviado): dizer isso evita o admin achar que errou a senha.
    if (error instanceof ApiError && error.statusCode === 503) return { kind: "unavailable" };
    // Qualquer outra falha (senha errada, painel desligado, 429) cai no próximo passo com a mesma mensagem.
    return { kind: "fail" };
  }
}

// Um único formulário pra dono, cliente e a conta da plataforma, mas TRÊS identidades e sessões
// separadas (staff = NextAuth, cliente = cookie ta_consumer, plataforma = cookie ta_platform). Dono só
// entra por e-mail; telefone nunca tenta staff nem plataforma. Toda falha devolve a mesma mensagem —
// não diz qual identidade falhou nem se o identificador existe.
export async function loginAction(
  identifier: string,
  password: string,
  next?: string,
): Promise<LoginResult> {
  const id = identifier.trim();
  if (!id || !password) return { error: GENERIC_LOGIN_ERROR };

  if (id.includes("@")) {
    const staff = await tryStaffLogin(id, password);
    if (staff === "ok") return { redirectTo: staffDestination(next) };
    if (staff === "unverified") return { error: EMAIL_NOT_VERIFIED_MESSAGE, code: "EMAIL_NOT_VERIFIED" };
  }

  if (id.includes("@")) {
    const platform = await tryPlatformLogin(id, password);
    if (platform.kind === "ok") return { redirectTo: "/plataforma" };
    if (platform.kind === "code") return { needsCode: true, challengeId: platform.challengeId };
    if (platform.kind === "unavailable") {
      return { error: "Não foi possível enviar o código de acesso agora. Tente de novo em instantes." };
    }
  }

  try {
    const session = await consumerPublicFetch<ConsumerSession>("/public/consumer/login", {
      method: "POST",
      body: JSON.stringify({ identifier: id, password }),
      headers: { "User-Agent": (await browserUserAgent()) ?? "" },
    });
    await setConsumerToken(session.accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 429) {
      return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    }
    return { error: GENERIC_LOGIN_ERROR };
  }
  return { redirectTo: clientDestination(next) };
}

// Cadastro de cliente (também reivindica conta antiga: telefone que já tinha cadastro sem
// senha ou histórico em algum salão — ver ConsumerAuthService.register).
export async function registerAction(
  input: { name: string; phone: string; email: string; password: string; consent: boolean; emailCode?: string },
  next?: string,
): Promise<LoginResult> {
  try {
    const session = await consumerPublicFetch<ConsumerSession>("/public/consumer/register", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "User-Agent": (await browserUserAgent()) ?? "" },
    });
    await setConsumerToken(session.accessToken);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.statusCode === 429) {
        return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
      }
      return { error: error.message };
    }
    return { error: "Não foi possível criar a conta." };
  }
  return { redirectTo: clientDestination(next) };
}

// Reenvio do link de confirmação. O backend responde sempre igual (não revela se o e-mail existe nem se já confirmou).
export async function resendVerificationAction(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = email.trim().toLowerCase();
  if (!address.includes("@") || address.length > 254) return { ok: false, error: "Informe o e-mail da conta." };
  try {
    const response = await backendFetch(`${API_URL}/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
      cache: "no-store",
    });
    if (response.status === 429) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    if (!response.ok) return { ok: false, error: "Não foi possível reenviar agora. Tente de novo em instantes." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao comunicar com o servidor." };
  }
}

// Segunda etapa do login da plataforma: troca o código recebido por e-mail pela sessão. O token vai direto para o
// cookie httpOnly no servidor: nunca passa pelo JS do navegador.
export async function verifyPlatformCodeAction(
  challengeId: string,
  code: string,
): Promise<{ redirectTo: string } | { error: string; restart?: boolean }> {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return { error: "O código tem 6 dígitos." };

  try {
    const session = await platformPublicFetch<{ accessToken: string; expiresInSeconds: number }>(
      "/platform/auth/verify",
      { method: "POST", body: JSON.stringify({ challengeId, code: digits }) },
    );
    await setPlatformToken(session.accessToken, session.expiresInSeconds);
    return { redirectTo: "/plataforma" };
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 429) {
      return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    }
    // Código errado, vencido ou desafio descartado: o backend não distingue. Depois de alguns erros o desafio some, então
    // a tela oferece recomeçar.
    return { error: "Código inválido ou expirado. Confira o e-mail mais recente ou entre de novo.", restart: true };
  }
}

// Passo 1 do cadastro de cliente: pede o código de confirmação ao e-mail digitado. `required` falso = sem e-mail
// configurado no sistema (desenvolvimento): a tela pula a etapa do código.
export async function requestRegisterCodeAction(
  email: string,
): Promise<{ ok: true; required: boolean } | { ok: false; error: string }> {
  const address = email.trim().toLowerCase();
  if (!address.includes("@") || address.length > 254) return { ok: false, error: "Informe um e-mail válido." };
  try {
    const response = await backendFetch(`${API_URL}/public/consumer/register/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": (await browserUserAgent()) ?? "" },
      body: JSON.stringify({ email: address }),
      cache: "no-store",
    });
    if (response.status === 429) return { ok: false, error: "Muitos pedidos de código. Aguarde alguns minutos e tente de novo." };
    if (response.status === 503) return { ok: false, error: "Não foi possível concluir o cadastro agora. Tente novamente mais tarde." };
    if (!response.ok) return { ok: false, error: "Não foi possível enviar o código agora. Tente de novo em instantes." };
    const body = (await response.json().catch(() => null)) as { required?: boolean } | null;
    return { ok: true, required: body?.required !== false };
  } catch {
    return { ok: false, error: "Erro inesperado ao comunicar com o servidor." };
  }
}

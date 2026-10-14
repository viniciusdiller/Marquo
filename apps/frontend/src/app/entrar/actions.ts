"use server";

import { AuthError } from "next-auth";
import { isSafeRedirectPath } from "@/lib/safe-path";
import { headers } from "next/headers";
import type { ConsumerSession } from "@marquo/shared-types";
import { ApiError } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { consumerPublicFetch, setConsumerToken } from "@/lib/consumer-session";

// consumerPublicFetch roda no servidor: sem isso, o backend veria o User-Agent da chamada
// fetch() do Next (algo como "node"), não o do navegador de quem está logando — a lista de
// "Dispositivos conectados" mostraria "node" pra todo mundo em vez de "Chrome, Windows".
async function browserUserAgent(): Promise<string | undefined> {
  return (await headers()).get("user-agent") ?? undefined;
}

export type LoginResult = { redirectTo: string } | { error: string };

const GENERIC_LOGIN_ERROR = "E-mail/telefone ou senha incorretos.";

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

async function tryStaffLogin(email: string, password: string): Promise<boolean> {
  try {
    // redirect: false em vez de redirectTo: o signIn() do next-auth v5 constrói a URL de
    // redirect internamente (createActionURL) e essa construção trava a navegação no Next.js 16
    // (nextauthjs/next-auth#13388) — a sessão é criada certinho, mas o browser nunca navega.
    // O redirecionamento é feito pelo cliente com o `redirectTo` devolvido.
    const result = await signIn("credentials", { email, password, redirect: false });
    return !result?.error;
  } catch (error) {
    if (error instanceof AuthError) return false;
    throw error;
  }
}

// Um único formulário pra dono e cliente, mas DUAS identidades e duas sessões (staff = NextAuth,
// cliente = cookie ta_consumer). Dono só entra por e-mail; telefone nunca tenta staff. Toda
// falha devolve a mesma mensagem — não diz qual identidade falhou nem se o identificador existe.
export async function loginAction(
  identifier: string,
  password: string,
  next?: string,
): Promise<LoginResult> {
  const id = identifier.trim();
  if (!id || !password) return { error: GENERIC_LOGIN_ERROR };

  if (id.includes("@") && (await tryStaffLogin(id, password))) {
    return { redirectTo: staffDestination(next) };
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
  input: { name: string; phone: string; email: string; password: string; consent: boolean },
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

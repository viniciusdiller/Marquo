"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ConsumerSession } from "@marquo/shared-types";
import { backendFetch } from "@/lib/backend-fetch";
import { ApiError } from "@/lib/api";
import { consumerPublicFetch, setConsumerToken } from "@/lib/consumer-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
  // E-mail pedido: a tela usa no passo do código (conta de cliente).
  email?: string;
}

// Validação aqui é conforto: o backend revalida e responde SEMPRE igual, exista a conta ou não. Por isso esta
// tela também mostra a mesma confirmação em qualquer sucesso, sem dizer se o e-mail está cadastrado.
//
// Uma tela só para os dois tipos de conta: o mesmo pedido dispara o link da EQUIPE (dono, recepção, profissional) e o
// código do CLIENTE. Quem tiver cada tipo de conta recebe o que é seu; a resposta não revela qual existe.
export async function forgotPasswordAction(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) {
    return { error: "Informe um e-mail válido." };
  }

  const post = (path: string) =>
    backendFetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

  try {
    const responses = await Promise.all([post("/auth/forgot-password"), post("/public/consumer/password-reset/code")]);
    if (responses.some((r) => r.status === 429)) {
      return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    }
    if (responses.some((r) => r.status === 400)) return { error: "Informe um e-mail válido." };
    if (responses.some((r) => !r.ok)) return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
    return { sent: true, email };
  } catch {
    return { error: "Erro inesperado ao comunicar com o servidor." };
  }
}

export interface ResetConsumerPasswordState {
  error?: string;
}

// Passo do código (conta de cliente): código + nova senha. Deu certo, a pessoa já entra logada na conta de cliente.
export async function resetConsumerPasswordAction(
  _prev: ResetConsumerPasswordState | undefined,
  formData: FormData,
): Promise<ResetConsumerPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email.includes("@")) return { error: "Informe um e-mail válido." };
  if (code.length !== 6) return { error: "O código tem 6 dígitos." };
  if (password.length < 8) return { error: "A senha deve ter pelo menos 8 caracteres." };
  if (password !== confirmPassword) return { error: "As senhas não coincidem." };

  try {
    const session = await consumerPublicFetch<ConsumerSession>("/public/consumer/password-reset", {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
      headers: { "User-Agent": (await headers()).get("user-agent") ?? "" },
    });
    await setConsumerToken(session.accessToken);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.statusCode === 429) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
      return { error: error.message };
    }
    return { error: "Erro inesperado ao comunicar com o servidor." };
  }
  redirect("/minha-conta");
}

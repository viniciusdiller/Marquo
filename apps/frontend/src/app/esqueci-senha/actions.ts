"use server";

import { backendFetch } from "@/lib/backend-fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
}

// Validação aqui é conforto: o backend revalida e responde SEMPRE igual, exista a conta ou não. Por isso esta
// tela também mostra a mesma confirmação em qualquer sucesso, sem dizer se o e-mail está cadastrado.
export async function forgotPasswordAction(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) {
    return { error: "Informe um e-mail válido." };
  }

  try {
    const response = await backendFetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    if (response.status === 429) {
      return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    }
    if (response.status === 400) return { error: "Informe um e-mail válido." };
    if (!response.ok) return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
    return { sent: true };
  } catch {
    return { error: "Erro inesperado ao comunicar com o servidor." };
  }
}

"use server";

import { backendFetch } from "@/lib/backend-fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface VerifyEmailState {
  error?: string;
  verified?: boolean;
}

// A confirmação só acontece no CLIQUE (POST), nunca ao abrir a página: leitores de e-mail e antivírus abrem os links
// antes do usuário, e um GET que confirmasse gastaria o link de uso único sem ninguém ter clicado.
export async function verifyEmailAction(
  _prev: VerifyEmailState | undefined,
  formData: FormData,
): Promise<VerifyEmailState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Link inválido." };

  try {
    const response = await backendFetch(`${API_URL}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (response.status === 429) return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
      return { error: message ?? "Não foi possível confirmar agora." };
    }
    return { verified: true };
  } catch {
    return { error: "Erro inesperado ao comunicar com o servidor." };
  }
}

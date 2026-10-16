import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { assertSafeApiPath } from "./api-path";
import { backendFetch } from "./backend-fetch";
import { PLATFORM_COOKIE_NAME, platformCookieOptions } from "./platform-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function getPlatformToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLATFORM_COOKIE_NAME)?.value ?? null;
}

export async function setPlatformToken(token: string, maxAgeSeconds: number) {
  const store = await cookies();
  store.set(PLATFORM_COOKIE_NAME, token, platformCookieOptions(maxAgeSeconds));
}

export async function clearPlatformToken() {
  const store = await cookies();
  store.delete({ name: PLATFORM_COOKIE_NAME, path: "/" });
}

async function request<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const response = await backendFetch(`${API_URL}${assertSafeApiPath(path)}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? "Erro inesperado ao comunicar com o servidor.");
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Login (sem sessão). Só roda no servidor: o token nunca passa pelo JS do navegador.
export function platformPublicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

// Chamadas do painel: lê o cookie da plataforma e manda como Bearer. O backend revalida tudo
// (assinatura, e-mail, versão da senha) a cada requisição.
export async function platformFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPlatformToken();
  if (!token) throw new ApiError("Não autenticado.", 401);
  return request<T>(path, init, token);
}

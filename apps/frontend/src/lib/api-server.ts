import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { assertSafeApiPath } from "@/lib/api-path";
import { backendFetch } from "@/lib/backend-fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    redirect("/entrar");
  }

  // Upload de arquivo (FormData) não pode ter Content-Type forçado pra application/json —
  // o browser precisa setar multipart/form-data; boundary=... sozinho.
  const isFormData = init?.body instanceof FormData;

  const response = await backendFetch(`${API_URL}${assertSafeApiPath(path)}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${session.accessToken}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) {
      redirect("/entrar");
    }
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? "Erro inesperado ao comunicar com o servidor.");
    throw new ApiError(message, response.status);
  }

  // DELETE (ex.: remover logo/foto da galeria) responde 200 sem corpo — response.json()
  // direto quebraria com "Unexpected end of JSON input".
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as Promise<T>;
}

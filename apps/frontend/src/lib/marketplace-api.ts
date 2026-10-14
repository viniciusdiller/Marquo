import type {
  MarketplaceCategory,
  MarketplaceEstablishment,
  MarketplaceResult,
} from "@marquo/shared-types";
import { ApiError } from "./api";
import { assertSafeApiPath } from "./api-path";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${assertSafeApiPath(path)}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? "Erro inesperado.");
    throw new ApiError(message, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const marketplaceApi = {
  categories: () => req<MarketplaceCategory[]>("/public/marketplace/categories"),
  cities: () => req<string[]>("/public/marketplace/cities"),
  search: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    );
    return req<MarketplaceResult[]>(`/public/marketplace/search?${qs.toString()}`);
  },
  establishment: (slug: string) =>
    req<MarketplaceEstablishment>(`/public/marketplace/establishments/${encodeURIComponent(slug)}`),
};

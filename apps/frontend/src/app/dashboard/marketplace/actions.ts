"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { parseCoordinate } from "@/lib/masks";

export interface MarketplaceActionState {
  error?: string;
  ok?: boolean;
}

export interface CepLookupResult {
  ok: boolean;
  error?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ReverseGeocodeResult {
  ok: boolean;
  error?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
}

function fail(err: unknown): MarketplaceActionState {
  return { error: err instanceof ApiError ? err.message : "Erro inesperado." };
}

export async function lookupCepAction(rawCep: string): Promise<CepLookupResult> {
  const cleanCep = rawCep.replace(/\D/g, "");
  if (cleanCep.length !== 8) {
    return { ok: false, error: "CEP deve conter exatamente 8 dígitos." };
  }

  let street = "";
  let neighborhood = "";
  let city = "";
  let state = "";

  // 1. Tenta ViaCEP
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (!data.erro) {
        street = data.logradouro ?? "";
        neighborhood = data.bairro ?? "";
        city = data.localidade ?? "";
        state = data.uf ?? "";
      }
    }
  } catch {
    // ViaCEP falhou ou timeout, tenta BrasilAPI
  }

  // 2. Fallback para BrasilAPI
  if (!city) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        street = data.street ?? "";
        neighborhood = data.neighborhood ?? "";
        city = data.city ?? "";
        state = data.state ?? "";
      }
    } catch {
      // BrasilAPI também falhou
    }
  }

  if (!city) {
    return {
      ok: false,
      error: "Não encontramos o endereço por este CEP. Preencha manualmente.",
    };
  }

  // 3. Geocodificar endereço no OpenStreetMap
  let latitude: number | null = null;
  let longitude: number | null = null;

  try {
    const query = [street, neighborhood, city, state, "Brasil"].filter(Boolean).join(", ");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "Marquo-App/1.0 (contato@marquo.com.br)",
          Accept: "application/json",
        },
      },
    );
    clearTimeout(timeout);

    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (Array.isArray(geoData) && geoData.length > 0) {
        latitude = Number(Number(geoData[0].lat).toFixed(6));
        longitude = Number(Number(geoData[0].lon).toFixed(6));
      }
    }

    if (latitude === null && city) {
      const fallbackQuery = `${city}, ${state}, Brasil`;
      const fallbackRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1&countrycodes=br`,
        {
          headers: {
            "User-Agent": "Marquo-App/1.0 (contato@marquo.com.br)",
            Accept: "application/json",
          },
        },
      );
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          latitude = Number(Number(fallbackData[0].lat).toFixed(6));
          longitude = Number(Number(fallbackData[0].lon).toFixed(6));
        }
      }
    }
  } catch {
    // Geocodificação falhou silenciosamente, mantém os dados de texto
  }

  return {
    ok: true,
    street,
    neighborhood,
    city,
    state,
    latitude,
    longitude,
  };
}

export async function reverseGeocodeAction(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  if (typeof lat !== "number" || isNaN(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude inválida para geocodificação." };
  }
  if (typeof lng !== "number" || isNaN(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: "Longitude inválida para geocodificação." };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Marquo-App/1.0 (contato@marquo.com.br)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        ok: false,
        error: "Serviço de mapa indisponível no momento. Preencha os campos manualmente.",
      };
    }

    const data = await res.json();
    const addr = data.address || {};

    const road = addr.road || addr.pedestrian || addr.street || "";
    const houseNumber = addr.house_number || "";
    const street = [road, houseNumber].filter(Boolean).join(", ");

    const neighborhood =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.residential ||
      addr.subdistrict ||
      "";

    const city =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.village ||
      addr.city_district ||
      "";

    const state = addr.state || "";
    const rawCep = (addr.postcode || "").replace(/\D/g, "").slice(0, 8);
    const cep = rawCep.length === 8 ? `${rawCep.slice(0, 5)}-${rawCep.slice(5)}` : rawCep;

    return {
      ok: true,
      street,
      neighborhood,
      city,
      state,
      cep,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    };
  } catch {
    return {
      ok: false,
      error: "Falha ao obter endereço pelo GPS. Preencha os campos manualmente.",
    };
  }
}

export async function saveMarketplaceAction(
  _p: MarketplaceActionState,
  formData: FormData,
): Promise<MarketplaceActionState> {
  const num = (k: string) => {
    const v = formData.get(k);
    return v ? Number(v) : undefined;
  };
  const rawLat = String(formData.get("latitude") ?? "").trim();
  const rawLng = String(formData.get("longitude") ?? "").trim();
  const latitude = rawLat ? parseCoordinate(rawLat, "lat") : undefined;
  const longitude = rawLng ? parseCoordinate(rawLng, "lng") : undefined;
  if (latitude === null) return { error: "Latitude inválida (de -90 a 90, ex: -23,5505)." };
  if (longitude === null) return { error: "Longitude inválida (de -180 a 180, ex: -46,6333)." };
  if ((latitude === undefined) !== (longitude === undefined)) {
    return { error: "Informe latitude e longitude juntas, ou deixe as duas em branco." };
  }
  try {
    await authedFetch("/tenants/me/marketplace", {
      method: "PATCH",
      body: JSON.stringify({
        listedInMarketplace: formData.get("listed") === "on",
        address: String(formData.get("address") ?? "").trim() || undefined,
        city: String(formData.get("city") ?? "").trim() || undefined,
        neighborhood: String(formData.get("neighborhood") ?? "").trim() || undefined,
        latitude,
        longitude,
        priceRange: num("priceRange"),
        categorySlugs: formData.getAll("categorySlugs").map(String),
      }),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/marketplace");
  return { ok: true };
}

export async function hideReviewAction(id: string): Promise<MarketplaceActionState> {
  try {
    await authedFetch(`/reviews/${encodeURIComponent(id)}/hide`, { method: "PATCH" });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/marketplace");
  return { ok: true };
}

export async function reportReviewAction(id: string, reason: string): Promise<MarketplaceActionState> {
  try {
    await authedFetch(`/reviews/${encodeURIComponent(id)}/report`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/marketplace");
  return { ok: true };
}

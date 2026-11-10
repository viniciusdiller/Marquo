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
  // Quão preciso é o ponto: "street" = a rua foi achada no mapa; "neighborhood" = só o bairro (aproximado, a pessoa deve
  // arrastar o pin). Sem coordenada, nenhum dos dois.
  precision?: "street" | "neighborhood";
}

export interface ReverseGeocodeResult {
  ok: boolean;
  error?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
}

export interface GeocodeAddressParams {
  street: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state?: string;
}

export interface GeocodeResult {
  ok: boolean;
  error?: string;
  latitude?: number | null;
  longitude?: number | null;
  displayName?: string;
}

function fail(err: unknown): MarketplaceActionState {
  return { error: err instanceof ApiError ? err.message : "Erro inesperado." };
}

const NOMINATIM_HEADERS = {
  "User-Agent": "Marquo-App/1.0 (contato@marquo.com.br)",
  Accept: "application/json",
};

// Primeira coordenada que o Nominatim (OpenStreetMap) devolve para a consulta, ou null (sem resultado, erro ou demora).
async function nominatimFirst(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=1&${query}`, {
      signal: controller.signal,
      headers: NOMINATIM_HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const latitude = Number(data[0].lat);
    const longitude = Number(data[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// "Porto da Roça II (Bacaxá)" → ["Bacaxá", "Porto da Roça II"]: o OpenStreetMap costuma conhecer o nome do bairro maior, não o
// loteamento. Sem parênteses, devolve o próprio nome.
function neighborhoodNames(neighborhood: string): string[] {
  const inside = neighborhood.match(/\(([^)]+)\)/)?.[1]?.trim();
  const outside = neighborhood.replace(/\([^)]*\)/g, "").trim();
  return [inside, outside].filter((n): n is string => !!n);
}

// Ponto no mapa para o endereço de um CEP. NUNCA usa a coordenada que a BrasilAPI manda junto: ela é a do CENTRO DA CIDADE
// (a mesma para todos os CEPs de uma cidade), então toda busca caía no mesmo lugar. Tenta a rua; se o mapa não a conhece,
// cai para o bairro (aproximado); sem nenhum dos dois, não inventa ponto.
async function geocodeCepAddress(
  street: string,
  neighborhood: string,
  city: string,
  state: string,
): Promise<{ latitude: number; longitude: number; precision: "street" | "neighborhood" } | null> {
  if (street) {
    const found = await nominatimFirst(`street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}`);
    if (found) return { ...found, precision: "street" };
  }
  for (const name of neighborhoodNames(neighborhood)) {
    const place = [name, city, state].filter(Boolean).join(", ");
    const found = await nominatimFirst(`q=${encodeURIComponent(place)}`);
    if (found) return { ...found, precision: "neighborhood" };
  }
  return null;
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

  // 1. BrasilAPI v2: só o endereço. (Ela também devolve coordenadas, mas são as do centro da cidade: ver geocodeCepAddress.)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`, {
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
    // BrasilAPI falhou, tenta ViaCEP
  }

  // 2. Fallback para ViaCEP se cidade ainda vazia
  if (!city) {
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
      // ViaCEP também falhou
    }
  }

  if (!city) {
    return {
      ok: false,
      error: "Não encontramos o endereço por este CEP. Preencha manualmente.",
    };
  }

  // 3. Ponto no mapa pela rua (ou, se o mapa não a conhece, pelo bairro).
  const point = await geocodeCepAddress(street, neighborhood, city, state);

  return {
    ok: true,
    street,
    neighborhood,
    city,
    state,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    precision: point?.precision,
  };
}

export async function geocodeAddressAction(params: GeocodeAddressParams): Promise<GeocodeResult> {
  const { street, number, city, state } = params;
  if (!city) {
    return { ok: false, error: "A cidade é necessária para calcular a localização." };
  }

  const streetQuery = [number, street].filter(Boolean).join(" ");
  const structuredUrl = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(streetQuery)}&city=${encodeURIComponent(city)}${state ? `&state=${encodeURIComponent(state)}` : ""}&countrycodes=br&limit=1`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(structuredUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Marquo-App/1.0 (contato@marquo.com.br)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          ok: true,
          latitude: Number(Number(data[0].lat).toFixed(6)),
          longitude: Number(Number(data[0].lon).toFixed(6)),
          displayName: data[0].display_name,
        };
      }
    }
    return {
      ok: false,
      error: "Número ou rua não encontrados com precisão. Ajuste o marcador diretamente no mapa abaixo.",
    };
  } catch {
    return {
      ok: false,
      error: "Não foi possível calcular o ponto pelo endereço. Arraste o pin no mapa.",
    };
  }
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
      street: road,
      number: houseNumber,
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
    const updated = await authedFetch<{ slug?: string }>("/tenants/me/marketplace", {
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

    if (updated?.slug) {
      revalidatePath(`/${updated.slug}`);
    }
    revalidatePath("/[slug]", "page");
    revalidatePath("/descobrir");
    revalidatePath("/dashboard/marketplace");
  } catch (err) {
    return fail(err);
  }
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

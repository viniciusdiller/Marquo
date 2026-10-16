"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MapPinArea } from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceResult } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { PlaceCard } from "../marketplace/PlaceCard";
import { marketplaceApi } from "@/lib/marketplace-api";
import { getCoarsePosition, GeolocationFailure } from "@/lib/geolocation";

const MAX_PLACES = 8;
const RADIUS_KM = 25;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; places: MarketplaceResult[] }
  | { status: "error"; message: string };

// "Perto de você": a localização só é pedida num clique (ou quando o navegador já tem a
// permissão concedida de antes, caso em que não há aviso nenhum). Nada é guardado: a posição
// vive só na memória desta página e vai arredondada (~1 km) para a busca.
export function NearbyPlaces() {
  const [state, setState] = useState<State>({ status: "idle" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const { lat, lng } = await getCoarsePosition();
      const places = await marketplaceApi.search({
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(RADIUS_KM),
        sort: "distance",
        limit: String(MAX_PLACES),
      });
      setState({ status: "ready", places });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof GeolocationFailure
            ? err.message
            : "Não foi possível buscar os salões agora. Tente novamente.",
      });
    }
  }, []);

  useEffect(() => {
    // Permissão já concedida antes: carrega sozinho, sem prompt. Em qualquer outro estado
    // (prompt/denied/API ausente) espera o clique.
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        if (!cancelled && status.state === "granted") void load();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <section id="perto-de-voce" className="py-14 lg:py-16">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              Perto de você
            </h2>
            <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
              Os mais próximos primeiro. Usamos sua localização só para ordenar a busca; ela
              não fica guardada.
            </p>
          </div>
          {state.status !== "ready" ? (
            <button
              type="button"
              onClick={() => void load()}
              disabled={state.status === "loading"}
              className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-60"
            >
              <MapPinArea size={18} weight="bold" />
              {state.status === "loading" ? "Buscando..." : "Usar minha localização"}
            </button>
          ) : null}
        </div>

        {state.status === "error" ? (
          <p role="alert" className="mt-5 text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        ) : null}

        {state.status === "ready" ? (
          state.places.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500 dark:text-stone-400">
              Ainda não há salões cadastrados em até {RADIUS_KM} km de você. Veja todos em{" "}
              <Link href="/descobrir" className="font-medium text-accent-600 dark:text-accent-300">
                Descobrir
              </Link>
              .
            </p>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {state.places.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          )
        ) : null}
      </Container>
    </section>
  );
}

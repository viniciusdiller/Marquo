import Link from "next/link";
import type { MarketplaceResult } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { BrandPattern } from "../brand/BrandPattern";
import { PlaceCard } from "../marketplace/PlaceCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MAX_PLACES = 8;

// O backend já devolve ordenado: nota suavizada pelo nº de avaliações, não a média simples.
async function getTopRated(): Promise<MarketplaceResult[]> {
  try {
    const res = await fetch(
      `${API_URL}/public/marketplace/search?sort=rating&limit=${MAX_PLACES}`,
      { next: { revalidate: 300 } },
    );
    return res.ok ? ((await res.json()) as MarketplaceResult[]) : [];
  } catch {
    return [];
  }
}

// Só renderiza se houver negócio cadastrado — nada de seção vazia/placeholder na home.
export async function TopRatedPlaces() {
  const places = await getTopRated();
  if (places.length === 0) return null;

  return (
    <section className="relative isolate overflow-hidden bg-white py-16 lg:py-20 dark:bg-zinc-900/40">
      <BrandPattern mask="radial-gradient(ellipse 45% 55% at 0% 0%, black 0%, transparent 70%)" />
      <Container>
        <Reveal>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              Mais bem avaliados
            </h2>
            <Link
              href="/descobrir"
              className="shrink-0 text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-300 dark:hover:text-accent-200"
            >
              Ver todos
            </Link>
          </div>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
            Salões e barbearias com as melhores notas de quem já foi.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {places.map((place, i) => (
            <Reveal key={place.id} delay={i * 0.05}>
              <PlaceCard place={place} />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

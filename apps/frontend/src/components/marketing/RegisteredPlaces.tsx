import Link from "next/link";
import { MapPin, Star } from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceResult } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { PressCard } from "../ui/PressCard";
import { BrandPattern } from "../brand/BrandPattern";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MAX_PLACES = 8;

async function getFeaturedPlaces(): Promise<MarketplaceResult[]> {
  try {
    const res = await fetch(`${API_URL}/public/marketplace/search`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const results = (await res.json()) as MarketplaceResult[];
    return results.slice(0, MAX_PLACES);
  } catch {
    return [];
  }
}

// Só renderiza se houver negócio cadastrado — nada de seção vazia/placeholder na landing.
export async function RegisteredPlaces() {
  const places = await getFeaturedPlaces();
  if (places.length === 0) return null;

  return (
    <section className="relative isolate overflow-hidden bg-white py-20 lg:py-28 dark:bg-zinc-900/40">
      <BrandPattern mask="radial-gradient(ellipse 45% 55% at 0% 0%, black 0%, transparent 70%)" />
      <Container>
        <Reveal>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              Negócios que já usam o Marquo
            </h2>
            <Link
              href="/descobrir"
              className="hidden shrink-0 text-sm font-medium text-accent-600 hover:text-accent-700 sm:inline dark:text-accent-300 dark:hover:text-accent-200"
            >
              Ver todos
            </Link>
          </div>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
            Salões e barbearias cadastrados na plataforma, prontos para receber
            agendamento online.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {places.map((place, i) => (
            <Reveal key={place.id} delay={i * 0.05}>
              <PressCard
                href={`/${place.slug}`}
                className="flex h-full flex-col rounded-2xl border border-zinc-200 p-5 transition-colors hover:border-accent-300 dark:border-white/10"
              >
                {place.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${API_URL}${place.logoUrl}`}
                    alt=""
                    className="size-12 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-xl bg-accent-50 font-display text-lg font-semibold text-accent-600 dark:bg-accent-500/10 dark:text-accent-300">
                    {place.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <p className="mt-4 font-display font-semibold text-zinc-900 dark:text-white">
                  {place.name}
                </p>
                {place.city ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-stone-400">
                    <MapPin size={12} />
                    {[place.neighborhood, place.city].filter(Boolean).join(", ")}
                  </p>
                ) : null}

                {place.rating.average != null ? (
                  <span className="mt-3 flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                    <Star size={14} weight="fill" />
                    {place.rating.average.toFixed(1)}
                    <span className="text-xs text-zinc-400">({place.rating.count})</span>
                  </span>
                ) : null}
              </PressCard>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

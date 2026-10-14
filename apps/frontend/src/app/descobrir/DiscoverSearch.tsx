"use client";

import { useEffect, useState } from "react";
import { PressCard } from "@/components/ui/PressCard";
import { MagnifyingGlass, MapPin, Star } from "@phosphor-icons/react/dist/ssr";
import type {
  MarketplaceCategory,
  MarketplaceResult,
} from "@marquo/shared-types";
import { marketplaceApi } from "@/lib/marketplace-api";

const priceLabel = (n: number | null) => (n ? "$".repeat(n) : "");

export function DiscoverSearch({
  categories,
  cities,
  initialQuery = "",
  initialCity = "",
}: {
  categories: MarketplaceCategory[];
  cities: string[];
  initialQuery?: string;
  initialCity?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [city, setCity] = useState(initialCity);
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<MarketplaceResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setLoading(true);
      marketplaceApi
        .search({ q: q || undefined, city: city || undefined, category: category || undefined })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q, city, category]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2.5 dark:border-white/15">
          <MagnifyingGlass size={18} className="text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar salão, barbearia..."
            className="w-full bg-transparent text-sm outline-none dark:text-white"
          />
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">Todas as cidades</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("")}
          className={
            category === ""
              ? "rounded-full bg-accent-500 px-3 py-1 text-sm font-medium text-white"
              : "rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-white/15 dark:text-stone-200"
          }
        >
          Todos
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.slug)}
            className={
              category === c.slug
                ? "rounded-full bg-accent-500 px-3 py-1 text-sm font-medium text-white"
                : "rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-white/15 dark:text-stone-200"
            }
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-stone-400">Carregando...</p>
      ) : results.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-stone-400">
          Nenhum estabelecimento encontrado.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {results.map((r, i) => (
            <li
              key={r.id}
              className="animate-rise-in"
              style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
            >
              <PressCard
                href={`/${r.slug}`}
                className="block rounded-2xl border border-zinc-200 p-4 transition-[box-shadow,border-color] duration-200 hover:border-accent-300 hover:shadow-lg hover:shadow-accent-500/10 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display font-semibold text-zinc-900 dark:text-white">
                      {r.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-stone-400">
                      <MapPin size={12} />
                      {[r.neighborhood, r.city].filter(Boolean).join(", ")}
                      {r.distanceKm != null ? ` · ${r.distanceKm} km` : ""}
                    </p>
                  </div>
                  {r.rating.average != null ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                      <Star size={14} weight="fill" />
                      {r.rating.average.toFixed(1)}
                      <span className="text-xs text-zinc-400">({r.rating.count})</span>
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {r.categories.map((c) => (
                    <span
                      key={c.slug}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/5 dark:text-stone-300"
                    >
                      {c.name}
                    </span>
                  ))}
                  {r.priceRange ? (
                    <span className="text-xs text-zinc-400">{priceLabel(r.priceRange)}</span>
                  ) : null}
                </div>
              </PressCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

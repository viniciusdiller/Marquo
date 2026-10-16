import { MapPin, Star } from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceResult } from "@marquo/shared-types";
import { PressCard } from "../ui/PressCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Cartão de um estabelecimento (home e descoberta). distanceKm só vem preenchido quando a busca
// foi feita com a localização do visitante.
export function PlaceCard({ place }: { place: MarketplaceResult }) {
  const where = [place.neighborhood, place.city].filter(Boolean).join(", ");

  return (
    <PressCard
      href={`/${place.slug}`}
      className="flex h-full flex-col rounded-2xl border border-zinc-200 p-5 transition-[box-shadow,border-color] duration-200 hover:border-accent-300 hover:shadow-lg hover:shadow-accent-500/10 dark:border-white/10"
    >
      {place.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${API_URL}${place.logoUrl}`} alt="" className="size-12 rounded-xl object-cover" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent-50 font-display text-lg font-semibold text-accent-600 dark:bg-accent-500/10 dark:text-accent-300">
          {place.name.charAt(0).toUpperCase()}
        </div>
      )}

      <p className="mt-4 font-display font-semibold text-zinc-900 dark:text-white">{place.name}</p>

      {where ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-stone-400">
          <MapPin size={12} className="shrink-0" />
          <span>
            {where}
            {place.distanceKm != null ? ` · ${place.distanceKm.toLocaleString("pt-BR")} km` : ""}
          </span>
        </p>
      ) : null}

      {place.categories.length > 0 ? (
        <p className="mt-2 line-clamp-1 text-xs text-zinc-500 dark:text-stone-400">
          {place.categories.map((c) => c.name).join(" · ")}
        </p>
      ) : null}

      {place.rating.average != null ? (
        <span className="mt-auto flex items-center gap-1 pt-3 text-sm font-medium text-amber-600 dark:text-amber-400">
          <Star size={14} weight="fill" />
          {place.rating.average.toFixed(1).replace(".", ",")}
          <span className="text-xs text-zinc-400">({place.rating.count})</span>
        </span>
      ) : (
        <span className="mt-auto pt-3 text-xs text-zinc-400">Ainda sem avaliações</span>
      )}
    </PressCard>
  );
}

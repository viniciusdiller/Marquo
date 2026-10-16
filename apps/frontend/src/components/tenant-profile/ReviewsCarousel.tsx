"use client";

import { useRef } from "react";
import { DateTime } from "luxon";
import { ArrowLeft, ArrowRight, Star } from "@phosphor-icons/react";
import type { MarketplaceEstablishment } from "@marquo/shared-types";

type Review = MarketplaceEstablishment["reviews"][number];

// Carrossel horizontal por rolagem nativa com snap (funciona com toque, trackpad e teclado); as setas só empurram a faixa.
export function ReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const track = useRef<HTMLUListElement>(null);

  function scrollBy(direction: -1 | 1) {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  const arrow =
    "hidden size-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 sm:flex dark:border-white/15 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-white/10";

  return (
    <div className="mt-6">
      <ul
        ref={track}
        tabIndex={0}
        aria-label="Avaliações dos clientes"
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-3 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((r) => (
          <li
            key={r.id}
            className="flex w-[82%] shrink-0 snap-start flex-col rounded-2xl border border-zinc-200 bg-white p-5 sm:w-[calc((100%-2rem)/3)] dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-0.5 text-amber-500" role="img" aria-label={`${r.rating} de 5 estrelas`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} weight={i < r.rating ? "fill" : "regular"} />
                ))}
              </span>
              <span className="text-xs text-zinc-400">
                {DateTime.fromISO(r.createdAt).setLocale("pt-BR").toFormat("dd/LL/yyyy")}
              </span>
            </div>
            {r.comment ? (
              <p className="mt-3 flex-1 text-sm text-zinc-700 dark:text-stone-300">{r.comment}</p>
            ) : (
              <span className="flex-1" />
            )}
            <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-stone-400">{r.authorName}</p>
          </li>
        ))}
      </ul>
      {reviews.length > 1 ? (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" aria-label="Avaliações anteriores" onClick={() => scrollBy(-1)} className={arrow}>
            <ArrowLeft size={16} />
          </button>
          <button type="button" aria-label="Próximas avaliações" onClick={() => scrollBy(1)} className={arrow}>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

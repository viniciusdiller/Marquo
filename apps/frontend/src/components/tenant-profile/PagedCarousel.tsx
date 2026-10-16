"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

const GAP_PX = 12;

// Faixa horizontal que avança um item por vez (2 visíveis a partir de sm, 1 no celular). Rolagem nativa com snap
// (toque/trackpad) + setas; o estado das setas vem da posição real da rolagem.
export function PagedCarousel({ label, items }: { label: string; items: React.ReactNode[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });

  function update() {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }

  function step(direction: -1 | 1) {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    el.scrollBy({ left: direction * (first.offsetWidth + GAP_PX), behavior: "smooth" });
  }

  const arrow =
    "flex size-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-white/15 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-white/10";

  return (
    <div>
      <ul
        ref={track}
        tabIndex={0}
        aria-label={label}
        onScroll={update}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <li key={i} className="w-full shrink-0 snap-start sm:w-[calc((100%-0.75rem)/2)]">
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" aria-label="Serviço anterior" disabled={edge.start} onClick={() => step(-1)} className={arrow}>
          <ArrowLeft size={15} />
        </button>
        <button type="button" aria-label="Próximo serviço" disabled={edge.end} onClick={() => step(1)} className={arrow}>
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

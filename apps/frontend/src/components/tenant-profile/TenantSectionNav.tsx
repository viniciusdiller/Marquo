"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

export interface SectionNavItem {
  id: string;
  label: string;
}

// Qual seção está na tela (a mais alta dentro da faixa de leitura, abaixo da barra fixa). Compartilhado entre as duas
// apresentações dos atalhos (na barra, no desktop; numa segunda linha, no celular), para só haver UM observador.
export function useActiveSection(items: SectionNavItem[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = items.map((item) => item.id).join("|");

  useEffect(() => {
    const targets = key
      .split("|")
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}

// Atalhos para as seções da página do negócio (como as abas da Trinks). Vivem NA barra do topo (TenantTopBar): no
// desktop no meio da barra; no celular, numa segunda linha rolável. Só recebe as seções que existem de verdade.
export function SectionLinks({
  items,
  active,
  className,
}: {
  items: SectionNavItem[];
  active: string | null;
  className?: string;
}) {
  if (items.length < 2) return null;

  return (
    <nav aria-label="Seções da página" className={className}>
      <ul className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "location" : undefined}
                className={clsx(
                  "block rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40",
                  isActive
                    ? "bg-(--tenant-accent) text-white"
                    : "text-zinc-600 hover:bg-(--tenant-accent)/10 hover:text-(--tenant-accent) dark:text-stone-300",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

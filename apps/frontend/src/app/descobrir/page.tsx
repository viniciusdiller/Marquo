import type { Metadata } from "next";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceCategory } from "@marquo/shared-types";
import { DiscoverSearch } from "./DiscoverSearch";
import { Footer } from "@/components/marketing/Footer";
import { SiteHeader } from "@/components/account/SiteHeader";
import { BrandPattern } from "@/components/brand/BrandPattern";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: "Descobrir salões e barbearias | Marquo",
  description:
    "Encontre salões de beleza e barbearias perto de você, veja avaliações e agende online.",
};

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default async function DescobrirPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string }>;
}) {
  const [{ q, city }, categories, cities] = await Promise.all([
    searchParams,
    fetchJson<MarketplaceCategory[]>("/public/marketplace/categories", []),
    fetchJson<string[]>("/public/marketplace/cities", []),
  ]);

  return (
    <div className="relative isolate">
      <BrandPattern mask="linear-gradient(to bottom, black, transparent 420px)" />
      <SiteHeader loginNext="/descobrir" />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
        >
          <CaretLeft size={14} />
          Voltar
        </Link>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl font-bold text-zinc-900 dark:text-white">Descobrir</h1>
          <Link
            href="/descobrir/avaliar"
            className="text-sm font-medium text-accent-600 dark:text-accent-300"
          >
            Avaliar uma visita
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          Salões e barbearias perto de você, com avaliações de quem já foi.
        </p>

        <div className="mt-6">
          <DiscoverSearch
            categories={categories}
            cities={cities}
            initialQuery={q ?? ""}
            initialCity={city ?? ""}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}

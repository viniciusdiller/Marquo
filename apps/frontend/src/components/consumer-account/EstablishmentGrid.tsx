import Link from "next/link";
import type { ConsumerEstablishment } from "@marquo/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function EstablishmentGrid({ establishments }: { establishments: ConsumerEstablishment[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {establishments.map((establishment, i) => (
        <li
          key={establishment.slug}
          style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
          className="animate-rise-in flex flex-col gap-5 rounded-3xl transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-zinc-900/5 border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-4">
            {establishment.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${API_URL}${establishment.logoUrl}`}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 font-brand text-xl font-bold text-(--tenant-accent)">
                {establishment.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className="min-w-0 font-brand text-lg leading-tight font-bold text-zinc-900 dark:text-white">
              {establishment.name}
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/${establishment.slug}/agendar`}
              className="rounded-xl bg-(--tenant-accent) px-4 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-90"
            >
              Agendar
            </Link>
            <Link
              href={`/${establishment.slug}`}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-900/5 dark:text-stone-300 dark:hover:bg-white/10"
            >
              Ver página
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

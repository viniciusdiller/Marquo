import { DateTime } from "luxon";
import { Star } from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceEstablishment } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";

export function ReviewsSection({
  rating,
  reviews,
}: {
  rating: MarketplaceEstablishment["rating"];
  reviews: MarketplaceEstablishment["reviews"];
}) {
  if (reviews.length === 0) return null;

  return (
    <Reveal>
      <section className="border-t border-zinc-200 py-16 dark:border-white/10">
        <Container className="max-w-2xl">
          <SectionHeading
            eyebrow="Quem já passou por aqui"
            title="Avaliações"
            action={
              rating.average != null ? (
                <span className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <Star size={14} weight="fill" />
                  {rating.average.toFixed(1)} · {rating.count}{" "}
                  {rating.count === 1 ? "avaliação" : "avaliações"}
                </span>
              ) : null
            }
          />

          <ul className="mt-6 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={13} weight={i < r.rating ? "fill" : "regular"} />
                    ))}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {DateTime.fromISO(r.createdAt).setLocale("pt-BR").toFormat("dd/LL/yyyy")}
                  </span>
                </div>
                {r.comment ? (
                  <p className="mt-2 text-sm text-zinc-700 dark:text-stone-300">{r.comment}</p>
                ) : null}
                <p className="mt-1 text-xs text-zinc-400">{r.authorName}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </Reveal>
  );
}

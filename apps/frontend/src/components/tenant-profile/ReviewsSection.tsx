import { Star } from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceEstablishment } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";
import { ReviewsCarousel } from "./ReviewsCarousel";

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
      <section id="avaliacoes" className="scroll-mt-32 border-t border-zinc-200 py-16 dark:border-white/10">
        <Container>
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

          <ReviewsCarousel reviews={reviews} />
        </Container>
      </section>
    </Reveal>
  );
}

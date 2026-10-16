import { ArrowRight, Scissors } from "@phosphor-icons/react/dist/ssr";
import type { PublicService } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";
import { PagedCarousel } from "./PagedCarousel";

// Até 4 serviços ficam numa grade; a partir do 5º vira carrossel que avança de 1 em 1.
const PAGE_SIZE = 4;

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${rest}` : `${hours}h`;
}

function ServiceCard({ slug, service }: { slug: string; service: PublicService }) {
  return (
    <div className="group flex aspect-square w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-(--tenant-accent)/40 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
          <Scissors size={22} weight="duotone" />
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-stone-300">
          {formatDuration(service.durationMinutes)}
        </span>
      </div>

      <div className="mt-4 min-w-0">
        <p className="line-clamp-2 font-brand text-lg leading-snug font-semibold text-zinc-900 dark:text-white">
          {service.name}
        </p>
        {service.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-stone-400">{service.description}</p>
        ) : null}
      </div>

      <div className="mt-auto">
        <p className="font-brand text-2xl font-bold text-zinc-900 dark:text-white">{formatPrice(service.priceCents)}</p>
        <a
          href={`/${slug}/agendar`}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-(--tenant-accent)/10 px-3.5 py-2.5 text-sm font-semibold text-(--tenant-accent) transition-colors group-hover:bg-(--tenant-accent) group-hover:text-white"
        >
          Agendar
          <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}

export function ServicesSection({
  slug,
  services,
  embedded = false,
}: {
  slug: string;
  services: PublicService[];
  // true: vive dentro do cabeçalho, na coluna ao lado do cartão "Agende online" (sem faixa própria, borda nem Container).
  embedded?: boolean;
}) {
  if (services.length === 0) return null;

  if (embedded) {
    return (
      <section id="servicos" className="scroll-mt-32">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-brand text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Serviços</h2>
          <span className="text-sm text-zinc-500 dark:text-stone-400">
            {services.length} {services.length === 1 ? "serviço" : "serviços"}
          </span>
        </div>
        <div className="mt-4">
          {services.length > PAGE_SIZE ? (
            <PagedCarousel
              label="Serviços"
              items={services.map((service) => (
                <ServiceCard key={service.id} slug={slug} service={service} />
              ))}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <li key={service.id}>
                  <ServiceCard slug={slug} service={service} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <Reveal>
      <section id="servicos" className="scroll-mt-32 border-t border-zinc-200 py-16 dark:border-white/10">
        <Container>
          <SectionHeading
            eyebrow="O que oferecemos"
            title="Serviços"
            action={
              <span className="text-sm text-zinc-500 dark:text-stone-400">
                {services.length} {services.length === 1 ? "serviço" : "serviços"}
              </span>
            }
          />

          <div className="mt-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} slug={slug} service={service} />
            ))}
          </div>
        </Container>
      </section>
    </Reveal>
  );
}

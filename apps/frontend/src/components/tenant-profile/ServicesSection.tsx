import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { PublicService } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${rest}` : `${hours}h`;
}

export function ServicesSection({ slug, services }: { slug: string; services: PublicService[] }) {
  if (services.length === 0) return null;

  return (
    <Reveal>
      <section id="servicos" className="border-t border-zinc-200 py-16 dark:border-white/10">
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
              <div
                key={service.id}
                className="group flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 transition-colors hover:border-(--tenant-accent)/40 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="font-brand font-semibold text-zinc-900 dark:text-white">{service.name}</p>
                  {service.description ? (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">{service.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-400 dark:text-stone-500">
                    {formatDuration(service.durationMinutes)}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3">
                  <p className="font-brand text-lg font-bold text-zinc-900 dark:text-white">
                    {formatPrice(service.priceCents)}
                  </p>
                  <a
                    href={`/${slug}/agendar`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-(--tenant-accent)/10 px-3.5 py-2 text-sm font-semibold text-(--tenant-accent) transition-colors group-hover:bg-(--tenant-accent) group-hover:text-white"
                  >
                    Agendar
                    <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </Reveal>
  );
}

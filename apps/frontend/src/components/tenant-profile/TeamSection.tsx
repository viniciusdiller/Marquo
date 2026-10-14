import type { PublicProfessional } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function TeamSection({ slug, team }: { slug: string; team: PublicProfessional[] }) {
  if (team.length === 0) return null;

  return (
    <Reveal>
      <section className="border-t border-zinc-200 py-16 dark:border-white/10">
        <Container>
          <SectionHeading eyebrow="Quem cuida de você" title="Profissionais" />

          <div className="mt-8 grid gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {team.map((professional) => (
              <div
                key={professional.id}
                className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 p-5 text-center dark:border-white/10"
              >
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-(--tenant-accent)/10 font-brand text-lg font-bold text-(--tenant-accent)">
                  {initials(professional.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-brand font-semibold text-zinc-900 dark:text-white">
                    {professional.name}
                  </p>
                  {professional.bio ? (
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-stone-400">{professional.bio}</p>
                  ) : null}
                </div>
                <a
                  href={`/${slug}/agendar`}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:border-(--tenant-accent) hover:bg-(--tenant-accent) hover:text-white dark:border-white/10 dark:text-white"
                >
                  Ver agenda
                </a>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </Reveal>
  );
}

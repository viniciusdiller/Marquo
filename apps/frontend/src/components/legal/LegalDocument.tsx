import Link from "next/link";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/marketing/Footer";
import { BackLink } from "@/components/ui/BackLink";
import { LEGAL_DRAFT, splitPlaceholders } from "@/lib/legal";
import type { LegalSection } from "@/lib/legal-content";

// "2026-09-24" -> "24/09/2026".
function formatVersion(version: string): string {
  const [year, month, day] = version.split("-");
  return year && month && day ? `${day}/${month}/${year}` : version;
}

function Text({ value }: { value: string }) {
  return (
    <>
      {splitPlaceholders(value).map((part, index) =>
        part.placeholder ? (
          <mark
            key={index}
            className="rounded bg-amber-200/80 px-1 font-medium text-zinc-900 dark:bg-amber-400/30 dark:text-amber-100"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function LegalDocument({
  title,
  sections,
}: {
  title: string;
  sections: LegalSection[];
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 bg-stone-50 px-6 py-16 dark:bg-zinc-950">
        <article className="mx-auto w-full max-w-2xl">
          <BackLink href="/" label="Voltar" />
          <Link href="/" className="mt-6 inline-block">
            <Logo />
          </Link>
          <h1 className="mt-6 font-display text-3xl font-bold text-zinc-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
            Versão de {formatVersion(LEGAL_DOCS_VERSION)}
          </p>

          {LEGAL_DRAFT ? (
            <p
              role="note"
              className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100"
            >
              Rascunho, não revisado juridicamente. Os trechos destacados ainda precisam ser
              preenchidos ou decididos antes da publicação.
            </p>
          ) : null}

          <div className="mt-10 flex flex-col gap-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  {section.title}
                </h2>
                <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>
                      <Text value={paragraph} />
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

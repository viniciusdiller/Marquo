import Link from "next/link";
import { Container } from "../ui/Container";
import { Logo } from "../brand/Logo";
import { BrandPattern } from "../brand/BrandPattern";

// #como-funciona/#recursos/#faq são âncoras que só existem em /para-donos — em qualquer
// outra página (home, descobrir, [slug], etc.) viram link morto. ownerPage controla se essas
// colunas/links aparecem.
const accountLinks = [
  { href: "/entrar", label: "Entrar" },
  { href: "/para-donos", label: "Para donos" },
  { href: "/cadastro", label: "Começar grátis" },
];

export function Footer({ ownerPage = false }: { ownerPage?: boolean }) {
  return (
    <footer className="relative isolate overflow-hidden border-t border-zinc-200 py-14 dark:border-white/10">
      <BrandPattern mask="linear-gradient(to top, black, transparent 80%)" />
      <Container>
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Logo markSize={28} />
            <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-stone-400">
              Agenda online para profissionais de beleza, salões e barbearias.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {ownerPage ? (
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Produto
                </h3>
                <ul className="mt-4 flex flex-col gap-3">
                  <li>
                    <a
                      href="#como-funciona"
                      className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
                    >
                      Como funciona
                    </a>
                  </li>
                  <li>
                    <a
                      href="#recursos"
                      className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
                    >
                      Recursos
                    </a>
                  </li>
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Conta
              </h3>
              <ul className="mt-4 flex flex-col gap-3">
                {accountLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                {ownerPage ? (
                  <li>
                    <a
                      href="#faq"
                      className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
                    >
                      Perguntas frequentes
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-zinc-200 pt-6 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:text-stone-400">
          <p>
            © {new Date().getFullYear()} Marquo. Todos os direitos
            reservados.
          </p>
          <div className="flex gap-5">
            <Link href="/termos" className="transition-colors hover:text-zinc-900 dark:hover:text-white">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="transition-colors hover:text-zinc-900 dark:hover:text-white">
              Privacidade
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

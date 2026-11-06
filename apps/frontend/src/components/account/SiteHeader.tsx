import Link from "next/link";
import clsx from "clsx";
import { getNavSession } from "@/lib/nav-session";
import { Logo } from "../brand/Logo";
import { AccountNav } from "./AccountNav";
import { SiteMenu } from "./SiteMenu";

// Barra superior padrão das páginas que não têm uma própria (a home e a página do salão têm
// as delas, com o mesmo AccountNav). Server Component: lê a sessão e mostra o bloco de conta —
// nome, compromissos e perfil aparecem em toda página quando há login.
export async function SiteHeader({
  loginNext,
  narrow = false,
}: {
  loginNext?: string;
  // Alinha com conteúdos estreitos (ex.: /minha-conta).
  narrow?: boolean;
}) {
  const session = await getNavSession();

  return (
    <header
      // Marca a página: no celular o alternador de tema flutuante some e o tema passa a morar no SiteMenu.
      data-site-header
      className={clsx(
        "mx-auto flex w-full items-center justify-between gap-4 px-6 pt-5",
        narrow ? "max-w-4xl" : "max-w-7xl lg:px-8",
      )}
    >
      <Link href="/" className="shrink-0">
        <Logo markSize={28} />
      </Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link
          href="/descobrir"
          className="hidden text-sm font-semibold text-zinc-600 transition-colors hover:text-zinc-900 sm:inline dark:text-stone-300 dark:hover:text-white"
        >
          Descobrir salões
        </Link>
        <AccountNav session={session} loginNext={loginNext} />
        <SiteMenu />
      </div>
    </header>
  );
}

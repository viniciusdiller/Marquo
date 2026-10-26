import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowSquareOut, SignOut } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/brand/Logo";
import { platformFetch } from "@/lib/platform-session";
import { PlatformNav } from "./PlatformNav";
import { signOutPlatformAction } from "./actions";

// Área interna da empresa: fora dos buscadores e do sitemap.
export const metadata: Metadata = {
  title: "Plataforma | Marquo",
  robots: { index: false, follow: false },
};

export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  // O backend é quem valida (assinatura, e-mail da conta e versão da senha). Qualquer falha — sem
  // cookie, sessão vencida, painel desligado — manda para o login.
  const me = await platformFetch<{ email: string }>("/platform/me").catch(() => null);
  if (!me) redirect("/entrar");

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo markSize={28} />
            <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
              Plataforma
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-500 sm:inline dark:text-stone-400">{me.email}</span>
            <Link
              href="/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-200 dark:ring-white/15 dark:hover:bg-white/10"
            >
              <ArrowSquareOut size={16} />
              Ver site público
            </Link>
            <form action={signOutPlatformAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-200 dark:ring-white/15 dark:hover:bg-white/10"
              >
                <SignOut size={16} />
                Sair
              </button>
            </form>
          </div>
        </div>
        <PlatformNav />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

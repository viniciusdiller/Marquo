import Link from "next/link";
import type { NavSession } from "@/lib/nav-session";
import { BRAND } from "../brand/palette";
import { AccountMenu } from "./AccountMenu";

// Bloco de conta da barra superior, o mesmo em todas as páginas: cliente logado vê
// o menu do perfil (dropdown, com o total de horários futuros em "Minha agenda"); dono/staff vê o acesso à
// própria loja; deslogado vê "Entrar". Sem hooks, então serve tanto em Server quanto em Client
// Components. Define a paleta da marca aqui pra funcionar fora de /[slug] e /minha-conta.
export function AccountNav({
  session,
  loginNext,
}: {
  session: NavSession;
  // Caminho pra voltar depois do login (só quando deslogado).
  loginNext?: string;
}) {
  const scope = {
    "--tenant-accent": BRAND.primary,
    "--tenant-accent-secondary": BRAND.accentCheck,
  } as React.CSSProperties;

  if (session?.kind === "staff") {
    return (
      <Link
        href="/dashboard"
        className="rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-colors hover:bg-accent-600"
      >
        {session.role === "OWNER" ? "Minha loja" : "Painel"}
      </Link>
    );
  }

  if (session?.kind === "platform") {
    return (
      <Link
        href="/plataforma"
        className="rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-colors hover:bg-accent-600"
      >
        Plataforma
      </Link>
    );
  }

  if (!session) {
    return (
      <Link
        href={loginNext ? `/entrar?next=${encodeURIComponent(loginNext)}` : "/entrar"}
        className="rounded-full px-5 py-2.5 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-300 ring-inset transition-colors hover:bg-zinc-900/5 dark:text-white dark:ring-white/20 dark:hover:bg-white/10"
      >
        Entrar
      </Link>
    );
  }

  return (
    <div style={scope}>
      <AccountMenu name={session.name} upcomingCount={session.upcomingCount} />
    </div>
  );
}

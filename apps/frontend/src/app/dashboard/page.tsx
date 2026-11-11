import { redirect } from "next/navigation";
import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import { getAccess } from "@/lib/access-server";
import { firstAllowedHref } from "@/lib/access";

// A home do painel leva à primeira tela que a pessoa pode usar (a agenda, para a maioria).
export default async function DashboardHomePage() {
  const href = firstAllowedHref(await getAccess());
  if (href) redirect(href);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-stone-300">
      <LockSimple size={18} />
      Seu perfil ainda não tem acesso a nenhuma tela. Peça ao dono do negócio para liberar.
    </div>
  );
}

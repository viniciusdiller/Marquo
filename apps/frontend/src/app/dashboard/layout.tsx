import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowSquareOut, SignOut } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { getAccess } from "@/lib/access-server";
import { SidebarNav } from "./SidebarNav";
import { MobileSidebar } from "./MobileSidebar";
import { signOutAction } from "./actions";
import { Logo } from "@/components/brand/Logo";
import { type BillingStatusResponse, hasBillingAccess } from "@/lib/billing";
import { BillingBanner } from "./BillingBanner";
import { BillingGate } from "./BillingGate";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { TourProvider } from "@/components/tour/TourProvider";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dono do negócio",
  RECEPTIONIST: "Recepção",
  PROFESSIONAL: "Profissional",
};

interface TenantMe {
  name: string;
  slug: string;
}

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await auth();
  if (!session || session.error) {
    redirect("/entrar");
  }

  const [access, tenant, billing] = await Promise.all([
    getAccess(),
    authedFetch<TenantMe>("/tenants/me").catch(() => null),
    authedFetch<BillingStatusResponse>("/billing/status").catch(() => null),
  ]);

  const userName = session.user?.name ?? "";
  const initials =
    userName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <TourProvider>
    <div className="flex min-h-dvh bg-stone-50 dark:bg-zinc-950">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-zinc-200 p-5 md:block dark:border-white/10">
        <Logo />
        {tenant ? (
          <>
            <p className="mt-1 truncate text-sm text-zinc-500 dark:text-stone-400">
              {tenant.name}
            </p>
            <Link
              href={`/${tenant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-300 dark:hover:text-accent-200"
            >
              <ArrowSquareOut size={16} />
              Ver página pública
            </Link>
          </>
        ) : null}

        <div className="mt-8">
          <SidebarNav access={access} />
        </div>
      </aside>

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <BrandPattern mask="radial-gradient(ellipse 60% 320px at 100% 0%, black 0%, transparent 100%)" />
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-zinc-200 bg-stone-50/85 px-4 py-3 backdrop-blur-md md:px-6 md:py-4 dark:border-white/10 dark:bg-zinc-950/85">
          <div className="flex min-w-0 items-center gap-1 md:gap-3">
            <MobileSidebar tenant={tenant} access={access} />
            <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700 md:size-9 dark:bg-accent-500/15 dark:text-accent-300">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{userName}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-stone-400">
                  {access.profileName ?? ROLE_LABEL[session.user.role] ?? session.user.role}
                </p>
              </div>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-stone-400 dark:hover:bg-white/5 dark:hover:text-stone-200"
            >
              <SignOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </header>

        {billing ? <BillingBanner billing={billing} /> : null}

        <main className="flex-1 p-4 md:p-6">
          <BillingGate blocked={billing ? !hasBillingAccess(billing.status) : false}>{children}</BillingGate>
        </main>
      </div>
    </div>
    </TourProvider>
  );
}

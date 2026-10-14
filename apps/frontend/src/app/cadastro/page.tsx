import Link from "next/link";
import type { Metadata } from "next";
import { SignupFlow } from "./SignupFlow";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/marketing/Footer";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { BackLink } from "@/components/ui/BackLink";
import { type PlanInfo, isPlanInfo } from "@/lib/billing";
import { parsePlanParam } from "@/lib/signup-plan";

export const metadata: Metadata = { title: "Criar conta - Marquo" };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TIER_ORDER = ["ESSENCIAL", "PROFISSIONAL", "PREMIUM"];

// Os planos vêm do backend (GET /plans, público) para o preço mostrado ser o que o dono vai pagar: nada
// hardcoded aqui. Se a API estiver fora do ar, o cadastro segue sem a etapa de plano em vez de travar.
async function fetchPlans(): Promise<PlanInfo[]> {
  try {
    const res = await fetch(`${API_URL}/plans`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isPlanInfo).sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  } catch {
    return [];
  }
}

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ plano?: string | string[] }> }) {
  const [{ plano }, plans] = await Promise.all([searchParams, fetchPlans()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="relative isolate flex-1 bg-stone-50 px-5 py-8 sm:px-6 sm:py-10 dark:bg-zinc-950">
        <BrandPattern mask="radial-gradient(ellipse 55% 60% at 50% 50%, transparent 30%, black 100%)" />
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <BackLink href="/" label="Voltar" />
          <Link href="/" aria-label="Marquo, página inicial">
            <Logo />
          </Link>
          <Link
            href="/entrar"
            className="rounded-lg px-1 py-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900 dark:text-stone-300 dark:hover:text-white"
          >
            Já tenho conta
          </Link>
        </div>

        <div className="mt-8 pb-8">
          <SignupFlow plans={plans} initialTier={parsePlanParam(plano)} />
        </div>
      </main>
      <Footer />
    </div>
  );
}

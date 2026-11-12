import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { type BillingStatusResponse, type PlanInfo, type PlanTier, planActionFor } from "@/lib/billing";
import { PageHeader } from "@/components/ui/PageHeader";
import { CheckoutForm } from "../../CheckoutForm";

export const metadata: Metadata = { title: "Assinar plano", robots: { index: false } };

const TIERS: readonly PlanTier[] = ["ESSENCIAL", "PROFISSIONAL", "PREMIUM"];

// O endereço usa o plano em minúsculas (/assinar/profissional). Qualquer outro valor cai fora da lista e volta para os planos.
function tierFromSlug(slug: string): PlanTier | null {
  const tier = slug.toUpperCase();
  return (TIERS as readonly string[]).includes(tier) ? (tier as PlanTier) : null;
}

// Só o dono paga. O que a tela oferece vem do mesmo `planActionFor` dos cards; quem decide o que vale é o backend.
export default async function CheckoutPage({ params }: { params: Promise<{ tier: string }> }) {
  const { tier: slug } = await params;
  const session = await auth();
  if (session?.user.role !== "OWNER") redirect("/dashboard/plano");

  const tier = tierFromSlug(slug);
  const [billing, plans] = await Promise.all([
    authedFetch<BillingStatusResponse>("/billing/status").catch(() => null),
    authedFetch<PlanInfo[]>("/plans").catch(() => null),
  ]);
  const plan = tier ? plans?.find((p) => p.tier === tier) : undefined;

  if (!billing || !plans) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader title="Assinar plano" description="Pagamento do plano do seu negócio." />
        <p role="alert" className="mt-8 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar as informações do seu plano agora. Tente novamente em instantes.
        </p>
      </div>
    );
  }
  if (!plan) redirect("/dashboard/plano");

  const action = planActionFor(billing, plan.tier);
  if (action !== "SUBSCRIBE" && action !== "RENEW_PIX") redirect("/dashboard/plano");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={action === "RENEW_PIX" && billing.subscription?.plan.tier === plan.tier ? "Pagar o próximo mês" : `Assinar o plano ${plan.name}`}
        description="Confira seus dados e escolha como pagar."
      />
      <Link
        href="/dashboard/plano"
        className="mt-2 inline-block text-sm font-medium text-zinc-600 underline underline-offset-2 hover:no-underline dark:text-stone-300"
      >
        ← Voltar aos planos
      </Link>
      <div className="mt-5">
        <CheckoutForm plan={plan} mode={action === "RENEW_PIX" ? "renew" : "new"} />
      </div>
    </div>
  );
}

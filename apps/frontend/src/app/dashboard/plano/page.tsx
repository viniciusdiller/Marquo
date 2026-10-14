import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PLAN_COOKIE, parsePlanCookie } from "@/lib/signup-plan";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import {
  type BillingStatusResponse,
  type PlanInfo,
  canOpenPortal,
  daysUntil,
  formatBRL,
  formatDate,
} from "@/lib/billing";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { PlanCards } from "./PlanCards";
import { PortalButton } from "./PortalButton";
import { RefreshButton } from "./RefreshButton";

export const metadata: Metadata = { title: "Plano e cobrança - Marquo" };

function statusSummary(billing: BillingStatusResponse): string {
  const sub = billing.subscription;
  switch (billing.status) {
    case "TRIALING": {
      const left = daysUntil(billing.trialEndsAt);
      return left <= 0
        ? "Você está no período de teste, que termina hoje."
        : `Você está no período de teste: ${left} dia${left === 1 ? "" : "s"} restante${left === 1 ? "" : "s"} (até ${formatDate(billing.trialEndsAt)}).`;
    }
    case "TRIAL_EXPIRED":
      return "Seu período de teste terminou. Escolha um plano para voltar a usar o Marquo.";
    case "ACTIVE":
      return sub
        ? sub.cancelAtPeriodEnd && sub.currentPeriodEnd
          ? `Plano ${sub.plan.name} (${formatBRL(sub.plan.priceCents)}/mês), com cancelamento agendado: você mantém o acesso até ${formatDate(sub.currentPeriodEnd)}.`
          : `Plano ${sub.plan.name} (${formatBRL(sub.plan.priceCents)}/mês)${sub.currentPeriodEnd ? `, com renovação em ${formatDate(sub.currentPeriodEnd)}` : ""}.`
        : "Assinatura ativa.";
    case "PAST_DUE":
      return "O último pagamento falhou. Você ainda tem acesso, mas precisa regularizar o pagamento para não perdê-lo.";
    case "UNPAID":
      return "Não conseguimos cobrar a assinatura. Atualize a forma de pagamento para reativar o acesso.";
    case "CANCELED":
      return "Sua assinatura foi cancelada. Escolha um plano para voltar a usar o Marquo.";
    case "INCOMPLETE":
      return "O pagamento da sua assinatura ainda não foi concluído. Escolha um plano para tentar de novo.";
  }
}

export default async function PlanoPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const session = await auth();
  // Plano que o dono marcou ao se cadastrar (cookie de preferência, validado: só um dos três tiers). Só destaca
  // o card; não muda nada no que é cobrado nem no acesso.
  const suggestedTier = parsePlanCookie((await cookies()).get(PLAN_COOKIE)?.value);
  const isOwner = session?.user.role === "OWNER";

  const [billing, plans] = await Promise.all([
    authedFetch<BillingStatusResponse>("/billing/status").catch(() => null),
    authedFetch<PlanInfo[]>("/plans").catch(() => null),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Plano e cobrança"
        description="Escolha o plano do seu negócio e gerencie o pagamento."
      />

      {checkout === "success" ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          Pagamento recebido! A confirmação chega em alguns segundos. Se o plano ainda não aparecer, <RefreshButton />.
        </p>
      ) : checkout === "cancelled" ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-stone-300"
        >
          Pagamento cancelado. Nada foi cobrado.
        </p>
      ) : null}

      {!billing || !plans ? (
        <p role="alert" className="mt-8 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar as informações do seu plano agora. Tente novamente em instantes.
        </p>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <p className="text-sm text-zinc-700 dark:text-stone-200">{statusSummary(billing)}</p>
            {isOwner && canOpenPortal(billing) ? (
              <div className="mt-4">
                <PortalButton label={billing.status === "PAST_DUE" || billing.status === "UNPAID" ? "Regularizar pagamento" : "Gerenciar pagamento"} />
              </div>
            ) : null}
            {!isOwner ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-stone-400">
                Só o dono do negócio pode alterar o plano e o pagamento.
              </p>
            ) : null}
          </section>

          <HowItWorks>
            <p>
              O plano define <strong>quantos profissionais ativos</strong> você pode ter. Todas as
              contas começam com um período de teste, sem cartão.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ao fim do teste, o painel é bloqueado até você assinar um plano.</li>
              <li><strong>Gerenciar pagamento</strong> abre o portal seguro da Stripe, onde você troca o cartão, vê faturas e cancela.</li>
              <li><strong>Trocar de plano</strong> vale na hora, com crédito ou cobrança proporcional. Se o novo plano tiver menos vagas, você escolhe quais profissionais desativar (só quem não tem atendimentos futuros).</li>
              <li>Cancelando, você mantém o acesso até o fim do período já pago.</li>
            </ul>
          </HowItWorks>

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Planos</h2>
            <div className="mt-4">
              <PlanCards plans={plans} billing={billing} isOwner={isOwner} suggestedTier={suggestedTier} />
            </div>
            <p className="mt-4 text-xs text-zinc-500 dark:text-stone-400">
              Cobrança mensal no cartão, processada pela Stripe. Você pode cancelar quando quiser e mantém o acesso
              até o fim do período pago.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

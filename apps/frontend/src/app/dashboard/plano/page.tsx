import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PLAN_COOKIE, parsePlanCookie } from "@/lib/signup-plan";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import {
  type BillingStatusResponse,
  type PlanInfo,
  daysUntil,
  formatBRL,
  formatDate,
} from "@/lib/billing";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { PlanCards } from "./PlanCards";
import { CancelButton } from "./CancelButton";
import { ReturnSync } from "./ReturnSync";

export const metadata: Metadata = { title: "Plano e cobrança - Marquo" };

const METHOD_LABEL = { CARD_RECURRING: "cartão (cobrança automática todo mês)", PIX_MONTHLY: "Pix mensal" } as const;

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
      return "Seu período de teste terminou. Assine um plano para voltar a usar o Marquo.";
    case "SUSPENDED":
      return "Sua conta foi suspensa pela equipe do Marquo. Entre em contato com o suporte para reativar o acesso.";
    case "EXPIRED":
      return "Seu acesso de cortesia terminou. Assine um plano para continuar usando o Marquo.";
    case "PERIOD_ENDED":
      return "O mês do seu plano terminou. Gere o Pix do próximo mês para voltar a usar o Marquo.";
    case "ACTIVE": {
      if (!sub) return "Assinatura ativa.";
      if (sub.courtesy) {
        return sub.currentPeriodEnd
          ? `Plano ${sub.plan.name}, concedido pela equipe do Marquo (cortesia) até ${formatDate(sub.currentPeriodEnd)}.`
          : `Plano ${sub.plan.name}, concedido pela equipe do Marquo (cortesia).`;
      }
      const how = sub.method ? ` Pagamento por ${METHOD_LABEL[sub.method]}.` : "";
      if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        return `Plano ${sub.plan.name} (${formatBRL(sub.plan.priceCents)}/mês), com cancelamento agendado: você mantém o acesso até ${formatDate(sub.currentPeriodEnd)}.${how}`;
      }
      if (sub.method === "PIX_MONTHLY" && sub.currentPeriodEnd) {
        return `Plano ${sub.plan.name} (${formatBRL(sub.plan.priceCents)}/mês), pago até ${formatDate(sub.currentPeriodEnd)}. Para continuar, pague o Pix do próximo mês antes dessa data.`;
      }
      return `Plano ${sub.plan.name} (${formatBRL(sub.plan.priceCents)}/mês)${sub.currentPeriodEnd ? `, com próxima cobrança em ${formatDate(sub.currentPeriodEnd)}` : ""}.${how}`;
    }
    case "PAST_DUE":
      return "O último pagamento falhou. Você ainda tem acesso, mas precisa regularizar o pagamento para não perdê-lo.";
    case "UNPAID":
      return "Não conseguimos confirmar o pagamento da sua assinatura. Assine de novo para reativar o acesso.";
    case "CANCELED":
      return "Sua assinatura foi cancelada. Assine novamente para voltar a usar o Marquo.";
    case "INCOMPLETE":
      return "O pagamento da sua assinatura ainda não foi concluído. Escolha um plano para tentar de novo.";
  }
}

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; tentativa?: string }>;
}) {
  const { checkout, tentativa } = await searchParams;
  const session = await auth();
  // Plano que o dono marcou ao se cadastrar (cookie de preferência, validado: só um dos três tiers). Só destaca
  // o card; não muda nada no que é cobrado nem no acesso.
  const suggestedTier = parsePlanCookie((await cookies()).get(PLAN_COOKIE)?.value);
  const isOwner = session?.user.role === "OWNER";

  const [billing, plans] = await Promise.all([
    authedFetch<BillingStatusResponse>("/billing/status").catch(() => null),
    authedFetch<PlanInfo[]>("/plans").catch(() => null),
  ]);

  const sub = billing?.subscription ?? null;
  const canCancel =
    isOwner && sub && !sub.courtesy && sub.method !== null && !sub.cancelAtPeriodEnd && billing?.status === "ACTIVE";

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Plano e cobrança" description="Escolha o plano do seu negócio e gerencie o pagamento." />

      {checkout === "cartao" ? <ReturnSync attemptId={tentativa ?? null} /> : null}

      {!billing || !plans ? (
        <p role="alert" className="mt-8 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar as informações do seu plano agora. Tente novamente em instantes.
        </p>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <p className="text-sm text-zinc-700 dark:text-stone-200">{statusSummary(billing)}</p>
            {!billing.paymentsEnabled ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-stone-400">
                O pagamento online ainda não está disponível. Para ativar um plano, fale com a equipe do Marquo.
              </p>
            ) : null}
            {!isOwner ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-stone-400">
                Só o dono do negócio pode assinar, pagar e cancelar.
              </p>
            ) : null}
            {canCancel ? (
              <div className="mt-4">
                <CancelButton untilLabel={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : null} />
              </div>
            ) : null}
          </section>

          <HowItWorks>
            <p>
              O plano define <strong>quantos profissionais ativos</strong> você pode ter. Todas as contas começam
              com um período de teste, sem cartão.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Cartão:</strong> a cobrança é automática todo mês, até você cancelar. O acesso vai até o fim
                do período pago.
              </li>
              <li>
                <strong>Pix mensal:</strong> você paga um Pix por mês. Se o mês acabar sem um novo pagamento, o painel
                é bloqueado até você pagar de novo.
              </li>
              <li>
                <strong>Cupom:</strong> informe o código ao assinar. O desconto vale na primeira cobrança.
              </li>
              <li>Se o plano tiver menos vagas do que você tem de profissionais ativos, é preciso desativar o excedente antes.</li>
            </ul>
          </HowItWorks>

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Planos</h2>
            <div className="mt-4">
              <PlanCards plans={plans} billing={billing} isOwner={isOwner} suggestedTier={suggestedTier} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

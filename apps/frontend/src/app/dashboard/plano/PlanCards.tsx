"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import {
  type BillingStatusResponse,
  type PlanInfo,
  type PlanTier,
  formatBRL,
  planActionFor,
} from "@/lib/billing";
import { riseIn } from "@/lib/stagger";
import { CheckoutDialog } from "./CheckoutDialog";
import { ChangePlanDialog } from "./ChangePlanDialog";

function limitText(plan: PlanInfo): string {
  return plan.maxProfessionals === null ? "Profissionais ilimitados" : `Até ${plan.maxProfessionals} profissionais`;
}

// O botão de cada plano depende só do estado de cobrança (planActionFor, testado). Quem decide o que vale é o
// backend: a tela só evita oferecer o que ele recusaria.
export function PlanCards({
  plans,
  billing,
  isOwner,
  suggestedTier = null,
}: {
  plans: PlanInfo[];
  billing: BillingStatusResponse;
  isOwner: boolean;
  suggestedTier?: PlanTier | null;
}) {
  const [open, setOpen] = useState<{ plan: PlanInfo; mode: "new" | "renew" } | null>(null);
  const [changeTo, setChangeTo] = useState<PlanInfo | null>(null);

  return (
    <div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {plans.map((plan, i) => {
          const action = planActionFor(billing, plan.tier);
          const isCurrent = billing.subscription?.plan.tier === plan.tier && billing.status !== "SUSPENDED" && !billing.subscription?.courtesy
            ? action === "CURRENT" || action === "RENEW_PIX"
            : false;
          const isSuggested = plan.tier === suggestedTier && !isCurrent;
          return (
            <li
              key={plan.tier}
              style={riseIn(i)}
              className={clsx(
                "animate-rise-in hover-lift flex flex-col rounded-2xl border p-5",
                isCurrent
                  ? "border-accent-500 bg-accent-50/50 dark:border-accent-400 dark:bg-accent-500/10"
                  : isSuggested
                    ? "border-accent-300 bg-white ring-2 ring-accent-500/30 dark:border-accent-400/60 dark:bg-zinc-900"
                    : "border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900",
              )}
            >
              {isSuggested ? (
                <span className="mb-3 inline-block w-fit rounded-full bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-700 dark:bg-accent-500/20 dark:text-accent-200">
                  Sua escolha no cadastro
                </span>
              ) : null}
              <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-white">{plan.name}</h3>
              <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">
                {formatBRL(plan.priceCents)}
                <span className="text-sm font-medium text-zinc-500 dark:text-stone-400"> /mês</span>
              </p>
              <p className="mt-3 text-sm text-zinc-600 dark:text-stone-300">{limitText(plan)}</p>

              <div className="mt-5 flex-1 content-end">
                {!isOwner ? null : action === "CURRENT" ? (
                  <span className="inline-block rounded-full bg-accent-100 px-3 py-1.5 text-sm font-semibold text-accent-700 dark:bg-accent-500/20 dark:text-accent-200">
                    Seu plano
                  </span>
                ) : action === "CHANGE" ? (
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setChangeTo(plan)}>
                    Trocar para este plano
                  </Button>
                ) : action === "RENEW_PIX" ? (
                  <Button type="button" className="w-full" onClick={() => setOpen({ plan, mode: "renew" })}>
                    {isCurrent ? "Pagar o próximo mês" : `Assinar ${plan.name}`}
                  </Button>
                ) : action === "SUBSCRIBE" ? (
                  <Button type="button" className="w-full" onClick={() => setOpen({ plan, mode: "new" })}>
                    Assinar {plan.name}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {changeTo && billing.subscription?.method ? (
        <ChangePlanDialog
          from={billing.subscription.plan}
          to={changeTo}
          method={billing.subscription.method}
          onClose={() => setChangeTo(null)}
        />
      ) : null}

      {open ? <CheckoutDialog plan={open.plan} mode={open.mode} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

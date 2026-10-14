"use client";

import { useState } from "react";
import clsx from "clsx";
import { ArrowRight, CalendarCheck, Check, CheckCircle, Clock, CreditCard, Gift } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { type PlanInfo, type PlanTier, formatBRL } from "@/lib/billing";
import { planCatalogEntry } from "@marquo/shared-types";
import { INCLUDED_IN_ALL_PLANS, TRIAL_DAYS_LABEL, teamLabel } from "@/lib/signup-plan";
import { SignupForm } from "./SignupForm";

type Step = "plan" | "account";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

// Etapa 1 = plano (o visitante vê o que existe antes de dar qualquer dado); etapa 2 = conta. A escolha é só uma
// intenção: ninguém é cobrado aqui e o plano só vale quando o dono assina em /dashboard/plano (ver lib/signup-plan.ts).
export function SignupFlow({ plans, initialTier }: { plans: PlanInfo[]; initialTier: PlanTier | null }) {
  // Sem planos (API fora do ar) o cadastro não pode travar: vai direto para a conta, sem etapa de plano.
  const hasPlans = plans.length > 0;
  const validInitial = initialTier && plans.some((p) => p.tier === initialTier) ? initialTier : null;
  const [step, setStep] = useState<Step>(validInitial || !hasPlans ? "account" : "plan");
  const [tier, setTier] = useState<PlanTier | null>(validInitial);
  const selected = plans.find((p) => p.tier === tier) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {hasPlans ? <Stepper step={step} onGoToPlan={() => setStep("plan")} /> : null}

      {step === "plan" ? (
        <PlanStep
          plans={plans}
          tier={tier}
          onSelect={setTier}
          onContinue={() => setStep("account")}
        />
      ) : (
        <AccountStep
          plan={selected}
          canChoosePlan={hasPlans}
          onChangePlan={() => setStep("plan")}
        />
      )}
    </div>
  );
}

function Stepper({ step, onGoToPlan }: { step: Step; onGoToPlan: () => void }) {
  const onAccount = step === "account";
  return (
    <ol aria-label="Etapas do cadastro" className="mx-auto flex max-w-sm items-center gap-3 text-sm font-semibold">
      <li className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAccount ? onGoToPlan : undefined}
          disabled={!onAccount}
          aria-current={!onAccount ? "step" : undefined}
          className={clsx("flex items-center gap-2 rounded-full", onAccount && "cursor-pointer", focusRing)}
        >
          <span
            className={clsx(
              "grid size-7 place-items-center rounded-full text-xs",
              onAccount ? "bg-accent-500 text-white" : "bg-accent-500 text-white ring-4 ring-accent-500/20",
            )}
          >
            {onAccount ? <Check size={14} weight="bold" /> : "1"}
          </span>
          <span className="text-zinc-900 dark:text-white">Plano</span>
        </button>
      </li>
      <li aria-hidden className="h-px flex-1 bg-zinc-300 dark:bg-white/15" />
      <li className="flex items-center gap-2" aria-current={onAccount ? "step" : undefined}>
        <span
          className={clsx(
            "grid size-7 place-items-center rounded-full text-xs",
            onAccount
              ? "bg-accent-500 text-white ring-4 ring-accent-500/20"
              : "bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-stone-400",
          )}
        >
          2
        </span>
        <span className={onAccount ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-stone-500"}>
          Sua conta
        </span>
      </li>
    </ol>
  );
}

function TrialPromise({ className }: { className?: string }) {
  return (
    <ul className={clsx("flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm", className)}>
      {[
        [Gift, `${TRIAL_DAYS_LABEL} grátis`],
        [CreditCard, "Sem cartão de crédito"],
        [CheckCircle, "Cancele quando quiser"],
      ].map(([Icon, text]) => {
        const I = Icon as typeof Gift;
        return (
          <li key={text as string} className="flex items-center gap-1.5 text-zinc-600 dark:text-stone-300">
            <I size={16} weight="fill" className="text-accent-500 dark:text-accent-300" />
            {text as string}
          </li>
        );
      })}
    </ul>
  );
}

function PlanStep({
  plans,
  tier,
  onSelect,
  onContinue,
}: {
  plans: PlanInfo[];
  tier: PlanTier | null;
  onSelect: (tier: PlanTier) => void;
  onContinue: () => void;
}) {
  const chosen = plans.find((p) => p.tier === tier) ?? null;

  return (
    <section className="animate-rise-in mt-10">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-zinc-900 md:text-4xl dark:text-white">
          Escolha o plano do seu negócio
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
          Todos os planos têm tudo incluído; muda só o tamanho da equipe. Você começa com {TRIAL_DAYS_LABEL} grátis e
          só paga se decidir continuar.
        </p>
        <TrialPromise className="mt-5" />
      </div>

      <div role="radiogroup" aria-label="Planos disponíveis" className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = plan.tier === tier;
          return (
            <button
              key={plan.tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(plan.tier)}
              className={clsx(
                "group relative flex flex-col rounded-2xl border bg-white p-6 text-left transition-all dark:bg-zinc-900",
                focusRing,
                isSelected
                  ? "border-accent-500 shadow-xl shadow-accent-500/10 ring-2 ring-accent-500 dark:border-accent-400 dark:ring-accent-400"
                  : "border-zinc-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-900/5 dark:border-white/10 dark:hover:border-white/25",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "absolute top-5 right-5 grid size-6 place-items-center rounded-full border transition-colors",
                  isSelected
                    ? "border-accent-500 bg-accent-500 text-white"
                    : "border-zinc-300 text-transparent dark:border-white/20",
                )}
              >
                <Check size={14} weight="bold" />
              </span>

              <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">{plan.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-zinc-500 dark:text-stone-400">
                {planCatalogEntry(plan.tier)?.audience}
              </p>

              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {formatBRL(plan.priceCents)}
                </span>
                <span className="text-sm font-medium text-zinc-500 dark:text-stone-400">/mês</span>
              </p>

              <p
                className={clsx(
                  "mt-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold",
                  isSelected
                    ? "bg-accent-500 text-white"
                    : "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-200",
                )}
              >
                {teamLabel(plan.maxProfessionals)}
              </p>

              <ul className="mt-5 flex flex-col gap-2.5 border-t border-zinc-100 pt-5 dark:border-white/10">
                {INCLUDED_IN_ALL_PLANS.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-stone-300">
                    <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-accent-500 dark:text-accent-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button type="button" onClick={onContinue} disabled={!chosen} className="w-full max-w-sm disabled:opacity-50">
          {chosen ? `Continuar com o ${chosen.name}` : "Escolha um plano para continuar"}
          {chosen ? <ArrowRight size={16} weight="bold" /> : null}
        </Button>
        <button
          type="button"
          onClick={onContinue}
          className={clsx(
            "rounded-lg px-2 py-1 text-sm font-semibold text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-stone-300 dark:hover:text-white",
            focusRing,
          )}
        >
          Ainda não sei, decidir depois
        </button>
        <p className="text-center text-sm text-zinc-500 dark:text-stone-400">
          Você pode trocar de plano a qualquer momento, dentro do painel.
        </p>
      </div>
    </section>
  );
}

function AccountStep({
  plan,
  canChoosePlan,
  onChangePlan,
}: {
  plan: PlanInfo | null;
  canChoosePlan: boolean;
  onChangePlan: () => void;
}) {
  const timeline = [
    { icon: CalendarCheck, title: "Hoje", text: "Crie sua conta e já comece a usar agenda, clientes e caixa." },
    { icon: Clock, title: `Por ${TRIAL_DAYS_LABEL}`, text: "Teste tudo sem cartão e sem cobrança." },
    {
      icon: CreditCard,
      title: "No fim do teste",
      text: plan
        ? `Assine o ${plan.name} se quiser continuar. Sem assinatura, o acesso fica pausado.`
        : "Escolha um plano se quiser continuar. Sem assinatura, o acesso fica pausado.",
    },
  ];

  return (
    <section className="animate-rise-in mt-10 grid items-start gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-8">
      <aside className="relative overflow-hidden rounded-3xl bg-accent-500 p-7 text-white lg:sticky lg:top-8 lg:p-9">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,_var(--tw-gradient-stops))] from-white/15 via-transparent to-transparent"
        />
        <div className="relative">
          <p className="text-xs font-semibold tracking-wide text-accent-100 uppercase">Seu plano</p>
          {plan ? (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl font-bold">{plan.name}</h2>
                <p className="text-right">
                  <span className="font-display text-2xl font-bold">{formatBRL(plan.priceCents)}</span>
                  <span className="text-sm text-accent-100"> /mês</span>
                </p>
              </div>
              <p className="mt-1 text-sm text-accent-50">{teamLabel(plan.maxProfessionals)}</p>
            </>
          ) : (
            <p className="mt-2 font-display text-xl font-bold">Você escolhe depois</p>
          )}
          {canChoosePlan ? (
            <button
              type="button"
              onClick={onChangePlan}
              className={clsx(
                "mt-3 rounded-lg text-sm font-semibold text-white underline underline-offset-4 hover:no-underline",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              )}
            >
              {plan ? "Alterar plano" : "Escolher um plano agora"}
            </button>
          ) : null}

          <div className="my-7 h-px bg-white/20" />

          <ol className="flex flex-col gap-5">
            {timeline.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15">
                  <Icon size={18} weight="fill" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    <span className="sr-only">Passo {index + 1}: </span>
                    {title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-accent-50">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-900/5 lg:p-9 dark:border-white/10 dark:bg-zinc-900 dark:shadow-none">
        <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Crie a conta do seu negócio</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          Leva menos de um minuto. Nenhum cartão é pedido agora.
        </p>
        <div className="mt-7">
          <SignupForm selectedTier={plan?.tier ?? null} />
        </div>
      </div>
    </section>
  );
}

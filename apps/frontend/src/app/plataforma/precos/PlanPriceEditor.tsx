"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { formatCentsBRL, moneyToCents } from "@/lib/masks";
import { brl } from "@/lib/money";
import type { PlatformPlanPrice } from "@/lib/platform-api";
import { setPlanPriceAction } from "../actions";

// Um cartão por plano. O campo só formata (máscara de reais); o backend revalida piso, teto e a ordem entre os planos.
export function PlanPriceEditor({ plan }: { plan: PlatformPlanPrice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(formatCentsBRL(plan.priceCents));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const cents = moneyToCents(value);
  const inRange = cents !== null && cents >= plan.minPriceCents && cents <= plan.listPriceCents;
  const changed = cents !== plan.priceCents;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setPlanPriceAction(plan.tier, value);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{plan.name}</h2>
        <p className="text-xs text-zinc-500 dark:text-stone-400">
          {plan.maxProfessionals === null ? "Profissionais ilimitados" : `Até ${plan.maxProfessionals} profissionais`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-zinc-500 dark:text-stone-400">Preço atual</dt>
          <dd className="font-semibold text-zinc-900 dark:text-white">
            {brl(plan.priceCents)}
            {plan.discounted ? (
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                em promoção
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500 dark:text-stone-400">Preço de tabela (teto)</dt>
          <dd className="text-zinc-700 dark:text-stone-300">{brl(plan.listPriceCents)}</dd>
        </div>
      </dl>

      <MaskedInput
        mask="money"
        id={`price-${plan.tier}`}
        name={`price-${plan.tier}`}
        label="Novo preço mensal (R$)"
        value={value}
        onChange={(next) => {
          setValue(next);
          setSaved(false);
        }}
      />
      <p className="-mt-2 text-xs text-zinc-500 dark:text-stone-400">
        De {brl(plan.minPriceCents)} até {brl(plan.listPriceCents)}.
      </p>

      {plan.cardSubscribers > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-stone-400">
          {plan.cardSubscribers} assinante{plan.cardSubscribers === 1 ? "" : "s"} no cartão não muda{plan.cardSubscribers === 1 ? "" : "m"} de valor.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!inRange || !changed || pending}
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar preço"}
        </button>
        {plan.discounted ? (
          <button
            type="button"
            onClick={() => {
              setValue(formatCentsBRL(plan.listPriceCents));
              setSaved(false);
            }}
            className="rounded-lg px-3 py-2 text-sm text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/20"
          >
            Voltar ao preço de tabela
          </button>
        ) : null}
      </div>

      {cents !== null && !inRange ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          O valor precisa ficar entre {brl(plan.minPriceCents)} e {brl(plan.listPriceCents)}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
          Preço salvo.
        </p>
      ) : null}
    </section>
  );
}

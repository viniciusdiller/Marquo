"use client";

import { useState, useTransition } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { formatPhoneBR } from "@/lib/masks";
import { ClientPicker } from "../comandas/ClientPicker";
import type { ClientOption } from "../comandas/actions";
import { enrollClubMemberAction } from "./actions";

export interface EnrollPlanChoice {
  id: string;
  name: string;
  priceLabel: string;
}

// Inscreve um cliente num pacote. Registrar a adesão = registrar o 1º mês como pago (o dinheiro entrou fora do sistema).
export function EnrollMemberForm({ plans }: { plans: EnrollPlanChoice[] }) {
  const [client, setClient] = useState<ClientOption | null>(null);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (plans.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-white/15 dark:text-stone-400">
        Crie e deixe ativo pelo menos um pacote para inscrever clientes.
      </p>
    );
  }

  function submit() {
    if (!client || !planId) return;
    startTransition(async () => {
      const result = await enrollClubMemberAction(client.id, planId);
      if (result.error) {
        setError(result.error);
        setSuccess(false);
        return;
      }
      setError(null);
      setSuccess(true);
      setClient(null);
    });
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-stone-200">Cliente</p>
        {client ? (
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-accent-300 bg-accent-50/60 px-3 py-2 text-sm dark:border-accent-500/40 dark:bg-accent-500/10">
            <span className="min-w-0 truncate">
              <strong className="font-semibold text-zinc-900 dark:text-white">{client.name}</strong>{" "}
              <span className="text-zinc-500 dark:text-stone-400">{formatPhoneBR(client.phone)}</span>
            </span>
            <button type="button" onClick={() => setClient(null)} aria-label="Trocar cliente" className="rounded-full p-1 text-zinc-500 hover:bg-zinc-900/5 dark:hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="mt-1.5">
            <ClientPicker
              onSelect={(c) => {
                setClient(c);
                setSuccess(false);
              }}
            />
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-stone-200">
        Pacote
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-[15px] font-normal text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {plan.priceLabel}/mês
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {success ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          Cliente inscrito. O primeiro mês foi lançado como receita paga no Financeiro.
        </p>
      ) : null}

      <div>
        <Button type="button" disabled={!client || !planId || pending} onClick={submit} className="disabled:opacity-60">
          {pending ? "Inscrevendo..." : "Inscrever e registrar o 1º mês como pago"}
        </Button>
      </div>
    </div>
  );
}

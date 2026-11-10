"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import { createClubPlanAction, type ClubActionState } from "./actions";

const initialState: ClubActionState = {};

export interface ClubServiceChoice {
  id: string;
  name: string;
}

export function CreatePlanForm({ services }: { services: ClubServiceChoice[] }) {
  const [state, action, pending] = useActionState(createClubPlanAction, initialState);

  if (services.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-white/15 dark:text-stone-400">
        Cadastre pelo menos um serviço ativo antes de criar um pacote.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-zinc-200 p-5 sm:grid-cols-3 dark:border-white/10">
      <div className="sm:col-span-3">
        <Input label="Nome do pacote" name="name" placeholder="Clube do Corte" required minLength={2} maxLength={80} hint="Como você e o cliente identificam o pacote." />
      </div>
      <MaskedInput mask="money" label="Valor mensal (R$)" name="price" placeholder="0,00" required hint="O que você cobra por mês. Vira receita no Financeiro." />
      <Input
        label="Usos por mês"
        name="usesPerMonth"
        type="number"
        inputMode="numeric"
        min={1}
        max={60}
        defaultValue={4}
        required
        hint="Quantos serviços do pacote o cliente faz sem pagar a cada mês."
      />
      <Input label="Descrição (opcional)" name="description" maxLength={300} hint="Ex.: 4 cortes por mês, sem fila." />

      <fieldset className="sm:col-span-3">
        <legend className="text-sm font-medium text-zinc-700 dark:text-stone-200">Serviços do pacote</legend>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-stone-400">Cada serviço feito gasta 1 uso. Os usos que sobram no mês não acumulam.</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <li key={service.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm has-checked:border-accent-400 has-checked:bg-accent-50/60 dark:border-white/10 dark:has-checked:bg-accent-500/10">
                <input type="checkbox" name="serviceIds" value={service.id} className="size-4 accent-accent-500" />
                <span className="min-w-0 truncate text-zinc-800 dark:text-stone-200">{service.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state?.error ? <p className="text-sm text-red-600 sm:col-span-3 dark:text-red-400">{state.error}</p> : null}

      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending} className="disabled:opacity-60">
          {pending ? "Criando..." : "Criar pacote"}
        </Button>
      </div>
    </form>
  );
}

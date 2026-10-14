"use client";

import { useActionState } from "react";
import type { AdminClientDetail } from "@marquo/shared-types";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import { type ClientFormState } from "./actions";

const initial: ClientFormState = {};

export function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (prev: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  client?: AdminClientDetail;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nome" name="name" autoComplete="off" defaultValue={client?.name ?? ""} required minLength={2} maxLength={120} hint="Como você chama o cliente no atendimento." />
        <MaskedInput
          mask="phone"
          label="Telefone"
          name="phone"
          type="tel"
          defaultValue={client?.phone ?? ""}
          required
          hint="Principal forma de contato (WhatsApp). Também identifica o cliente."
        />
        <Input label="E-mail" name="email" type="email" autoComplete="off" maxLength={254} defaultValue={client?.email ?? ""} hint="Opcional." />
        <Input
          label="Nascimento"
          name="birthDate"
          type="date"
          min="1900-01-01"
          defaultValue={client?.birthDate?.slice(0, 10) ?? ""}
          hint="Opcional. Útil para lembrar de aniversários."
        />
        <MaskedInput mask="cpf" label="CPF" name="cpf" placeholder="000.000.000-00" defaultValue={client?.cpf ?? ""} hint="Opcional. Só se precisar para nota ou cadastro." />
        <Input
          label="Tags (separadas por vírgula)"
          name="tags"
          hint="Etiquetas para agrupar clientes, ex.: VIP, noiva. Até 20 tags de até 40 caracteres."
          defaultValue={client?.tags.join(", ") ?? ""}
        />
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-stone-200">
        Observações
        <span className="-mt-1 text-xs font-normal text-zinc-400 dark:text-stone-500">Anotações livres da equipe: preferências, cuidados, histórico relevante.</span>
        <textarea
          name="notes"
          maxLength={2000}
          defaultValue={client?.notes ?? ""}
          rows={3}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-[15px] text-zinc-900 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit disabled:opacity-50">
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}

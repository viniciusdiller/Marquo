"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import { createServiceAction, type CreateServiceState } from "./actions";

const initialState: CreateServiceState = {};

export function CreateServiceForm() {
  const [state, action, pending] = useActionState(createServiceAction, initialState);

  return (
    <form
      action={action}
      className="grid gap-4 rounded-2xl border border-zinc-200 p-5 sm:grid-cols-3 dark:border-white/10"
    >
      <div data-tour="service-form-intro" className="sm:col-span-3 rounded-xl border border-accent-100 bg-accent-50/60 p-3 text-xs leading-relaxed text-accent-950 dark:border-accent-500/20 dark:bg-accent-500/10 dark:text-accent-200">
        💡 <strong>Regra importante da ordem:</strong> Para um cliente agendar este serviço na sua página,
        você precisa cadastrar o serviço e em seguida vinculá-lo ao barbeiro em <strong>Profissionais → Gerenciar</strong>.
      </div>

      <div data-tour="service-name">
        <Input label="Nome do serviço" name="name" placeholder="Corte Masculino" required minLength={2} maxLength={120} hint="Como o cliente vê o serviço na página de agendamento." />
      </div>
      <div data-tour="service-duration">
      <Input
        label={
          <span className="flex items-center gap-1.5">
            Duração (minutos)
            <FieldHelp title="Duração do Serviço">
              Determina o tempo de atendimento reservado na grade da agenda. O sistema só libera horários com espaço suficiente para essa duração.
            </FieldHelp>
          </span>
        }
        name="durationMinutes"
        type="number"
        inputMode="numeric"
        min={5}
        max={1440}
        step={5}
        required
        hint="Tempo que o profissional fica ocupado (5 a 1440)."
      />
      </div>
      <div data-tour="service-price">
        <MaskedInput mask="money" label="Preço (R$)" name="price" placeholder="0,00" required hint="Valor cobrado por este serviço." />
      </div>
      <div className="sm:col-span-3">
        <Input label="Descrição (opcional)" name="description" maxLength={1000} hint="Aparece na página pública. Ex.: o que está incluso no serviço." />
      </div>

      {state?.error ? (
        <p className="sm:col-span-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <div className="sm:col-span-3">
        <span data-tour="service-submit" className="inline-block">
        <Button type="submit" disabled={pending} className="disabled:opacity-60">
          {pending ? "Cadastrando..." : "Cadastrar serviço"}
        </Button>
        </span>
      </div>
    </form>
  );
}

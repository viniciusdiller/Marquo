"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import type {
  ClientIntakeResponse,
  IntakeFieldDef,
  IntakeFormSummary,
} from "@marquo/shared-types";
import { submitIntakeResponseAction } from "../actions";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: IntakeFieldDef;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const base =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white";
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        Sim
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <select className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        className={base}
        rows={2}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
  );
}

export function IntakeSection({
  clientId,
  forms,
  responses,
}: {
  clientId: string;
  forms: IntakeFormSummary[];
  responses: ClientIntakeResponse[];
}) {
  const activeForms = forms.filter((f) => f.isActive);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const responseByForm = new Map(responses.map((r) => [r.formId, r]));

  function open(form: IntakeFormSummary) {
    setOpenFormId(form.id);
    setError(null);
    setAnswers({ ...(responseByForm.get(form.id)?.answers ?? {}) });
  }

  function save(formId: string) {
    setError(null);
    startTransition(async () => {
      const result = await submitIntakeResponseAction(clientId, formId, answers);
      if (result.error) setError(result.error);
      else setOpenFormId(null);
    });
  }

  if (activeForms.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-stone-400">
        Nenhuma ficha de anamnese cadastrada. O dono cria fichas na tela de Fichas.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {activeForms.map((form) => {
        const response = responseByForm.get(form.id);
        const isOpen = openFormId === form.id;
        return (
          <div key={form.id} className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-white">{form.name}</p>
                {response ? (
                  <p className="text-xs text-zinc-400">
                    Atualizada em{" "}
                    {DateTime.fromISO(response.updatedAt).setLocale("pt-BR").toFormat("dd/LL/yyyy")}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400">Sem resposta</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => (isOpen ? setOpenFormId(null) : open(form))}
                className="text-sm font-medium text-accent-600 dark:text-accent-300"
              >
                {isOpen ? "Fechar" : response ? "Editar" : "Preencher"}
              </button>
            </div>

            {!isOpen && response ? (
              <dl className="mt-3 space-y-1 text-sm">
                {form.fields.map((field) => {
                  const val = response.answers[field.key];
                  if (val === undefined || val === "") return null;
                  return (
                    <div key={field.key} className="flex gap-2">
                      <dt className="text-zinc-400">{field.label}:</dt>
                      <dd className="text-zinc-700 dark:text-stone-300">
                        {typeof val === "boolean" ? (val ? "Sim" : "Não") : val}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}

            {isOpen ? (
              <div className="mt-4 space-y-3">
                {form.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-medium text-zinc-500 dark:text-stone-400">
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    <div className="mt-1">
                      <FieldInput
                        field={field}
                        value={answers[field.key]}
                        onChange={(v) => setAnswers((prev) => ({ ...prev, [field.key]: v }))}
                      />
                    </div>
                  </div>
                ))}
                {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => save(form.id)}
                  className="rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
                >
                  {isPending ? "Salvando..." : "Salvar ficha"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

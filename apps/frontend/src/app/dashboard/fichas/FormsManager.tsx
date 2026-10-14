"use client";

import { useState, useTransition } from "react";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import type { IntakeFieldDef, IntakeFormSummary } from "@marquo/shared-types";
import { riseIn } from "@/lib/stagger";
import { FieldHint } from "@/components/ui/HowItWorks";
import { saveIntakeFormAction } from "./actions";

const FIELD_TYPES: IntakeFieldDef["type"][] = ["text", "textarea", "boolean", "select"];
const TYPE_LABEL: Record<IntakeFieldDef["type"], string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  boolean: "Sim/Não",
  select: "Lista de opções",
};

function slugify(label: string) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function Editor({
  form,
  onDone,
}: {
  form: IntakeFormSummary | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(form?.name ?? "");
  const [isActive, setIsActive] = useState(form?.isActive ?? true);
  const [fields, setFields] = useState<IntakeFieldDef[]>(form?.fields ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addField() {
    setFields((prev) => [...prev, { key: "", label: "", type: "text" }]);
  }
  function patch(i: number, next: Partial<IntakeFieldDef>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...next } : f)));
  }

  function save() {
    setError(null);
    const prepared = fields
      .filter((f) => f.label.trim())
      .map((f, i) => ({
        ...f,
        label: f.label.trim(),
        // Rótulo só com símbolos ("???") gera slug vazio, que o backend recusa: cai num nome neutro.
        key: (f.key.trim() || slugify(f.label) || `campo_${i + 1}`) as string,
        options:
          f.type === "select"
            ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
            : undefined,
      }));
    if (!name.trim() || prepared.length === 0) {
      setError("Dê um nome e ao menos um campo com rótulo.");
      return;
    }
    startTransition(async () => {
      const result = await saveIntakeFormAction(form?.id ?? null, {
        name: name.trim(),
        fields: prepared,
        isActive,
      });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome da ficha (ex.: Anamnese capilar)"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-white/15 dark:bg-zinc-900 dark:text-white"
      />

      <FieldHint>
        O nome identifica o modelo na ficha do cliente. Use algo que diga para que serve.
      </FieldHint>

      <p className="mt-3 text-xs text-zinc-400 dark:text-stone-500">
        Cada campo vira uma pergunta que aparece pro profissional preencher na ficha do
        cliente. Escolha o tipo conforme a resposta esperada:
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-400 dark:text-stone-500">
        <li><strong>Texto curto:</strong> resposta de uma linha (ex.: “Produto que usa em casa”).</li>
        <li><strong>Texto longo:</strong> resposta aberta (ex.: “Alergias conhecidas”).</li>
        <li><strong>Sim/Não:</strong> uma caixa de marcar (ex.: “Fez química recente?”).</li>
        <li><strong>Lista de opções:</strong> o profissional escolhe uma; separe as opções por vírgula (ex.: liso, ondulado, cacheado).</li>
      </ul>

      <div className="mt-3 space-y-2">
        {fields.map((field, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={field.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder="Rótulo do campo"
              className="min-w-40 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
            />
            <select
              value={field.type}
              onChange={(e) => patch(i, { type: e.target.value as IntakeFieldDef["type"] })}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {field.type === "select" ? (
              <input
                value={field.options?.join(", ") ?? ""}
                onChange={(e) => patch(i, { options: e.target.value.split(",") })}
                placeholder="opções, separadas por vírgula"
                className="min-w-40 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
              />
            ) : null}
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={field.required ?? false}
                onChange={(e) => patch(i, { required: e.target.checked })}
              />
              obrigatório
            </label>
            <button
              type="button"
              onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
              className="text-zinc-400 hover:text-red-500"
              aria-label="Remover campo"
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-600 dark:text-accent-300"
      >
        <Plus size={14} /> Adicionar campo
      </button>

      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-stone-300">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Ficha ativa
      </label>
      <FieldHint>Desmarque para parar de oferecer este modelo, sem apagar as respostas já salvas.</FieldHint>

      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm dark:border-white/15 dark:text-stone-200"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-full bg-accent-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

export function FormsManager({ initialForms }: { initialForms: IntakeFormSummary[] }) {
  const [editing, setEditing] = useState<IntakeFormSummary | null | "new">(null);

  return (
    <div className="mt-6 space-y-4">
      {initialForms.map((form, i) =>
        editing !== null && editing !== "new" && editing.id === form.id ? (
          <Editor key={form.id} form={form} onDone={() => setEditing(null)} />
        ) : (
          <div
            key={form.id}
            style={riseIn(i)}
            className="animate-rise-in hover-lift flex items-center justify-between rounded-xl border border-zinc-200 p-4 dark:border-white/10"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-white">{form.name}</p>
              <p className="text-xs text-zinc-400">
                {form.fields.length} {form.fields.length === 1 ? "campo" : "campos"}
                {form.isActive ? "" : " · inativa"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(form)}
              className="text-sm font-medium text-accent-600 dark:text-accent-300"
            >
              Editar
            </button>
          </div>
        ),
      )}

      {editing === "new" ? (
        <Editor form={null} onDone={() => setEditing(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
        >
          <Plus size={16} weight="bold" />
          Nova ficha
        </button>
      )}
    </div>
  );
}

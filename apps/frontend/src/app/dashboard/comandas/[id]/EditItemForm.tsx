"use client";

import { useState } from "react";

export interface ItemEditChanges {
  quantity?: number;
  professionalId?: string | null;
}

// Edição inline de um item JÁ lançado: só quantidade e profissional (preço, tipo e serviço não mudam: o preço de catálogo vem do
// servidor). Só envia o que de fato mudou; o backend revalida tudo (quantidade 1 a 10.000, profissional do mesmo negócio).
export function EditItemForm({
  quantity,
  professionalId,
  team,
  pending,
  onSave,
  onCancel,
}: {
  quantity: number;
  professionalId: string | null;
  team: { id: string; name: string }[];
  pending: boolean;
  onSave: (changes: ItemEditChanges) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState(String(quantity));
  const [pro, setPro] = useState(professionalId ?? "");

  const parsed = Number(qty);
  const qtyValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000;
  const changes: ItemEditChanges = {};
  if (qtyValid && parsed !== quantity) changes.quantity = parsed;
  if (pro !== (professionalId ?? "")) changes.professionalId = pro === "" ? null : pro;
  const changed = Object.keys(changes).length > 0;

  return (
    <div role="group" aria-label="Editar item" className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-stone-300">
        Quantidade
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-invalid={!qtyValid}
          className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-stone-300">
        Profissional
        <select
          value={pro}
          onChange={(e) => setPro(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">Sem profissional</option>
          {team.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={pending || !qtyValid || !changed}
        onClick={() => onSave(changes)}
        className="rounded-full bg-accent-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
      >
        Salvar
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-stone-300 dark:hover:text-white"
      >
        Cancelar
      </button>
      {!qtyValid ? <p className="w-full text-xs text-red-600 dark:text-red-400">A quantidade deve ser um número inteiro de 1 a 10.000.</p> : null}
    </div>
  );
}

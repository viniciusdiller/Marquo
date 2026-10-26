"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { onlyDigits } from "@/lib/masks";
import { deleteConsumerAction } from "../actions";

// Exclusão em duas etapas: o botão "Excluir" só abre o formulário; para confirmar é preciso digitar o telefone da conta,
// registrar o motivo e marcar que é irreversível. O backend revalida tudo; isto só impede o clique sem olhar.
export function DeleteConsumerForm({ consumerId, name, phone }: { consumerId: string; name: string; phone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmPhone, setConfirmPhone] = useState("");
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aceita com ou sem DDI 55 (o backend normaliza do mesmo jeito).
  const typed = onlyDigits(confirmPhone).replace(/^55(?=\d{10,11}$)/, "");
  const canSubmit = typed === phone && reason.trim().length >= 10 && understood && !pending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteConsumerAction(consumerId, confirmPhone, reason);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível excluir.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Excluir a conta de ${name}`}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-50 dark:text-red-300 dark:ring-red-500/40 dark:hover:bg-red-500/10"
      >
        Excluir
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-72 flex-col gap-2" aria-label={`Excluir a conta de ${name}`}>
      <label className="text-xs font-medium text-zinc-700 dark:text-stone-200" htmlFor={`phone-${consumerId}`}>
        Digite o telefone da conta para confirmar
      </label>
      <input
        id={`phone-${consumerId}`}
        value={confirmPhone}
        onChange={(e) => setConfirmPhone(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
      />
      <label className="text-xs font-medium text-zinc-700 dark:text-stone-200" htmlFor={`reason-${consumerId}`}>
        Motivo (vai para a auditoria, sem dados pessoais)
      </label>
      <textarea
        id={`reason-${consumerId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={300}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
      />
      <label className="flex items-start gap-2 text-xs text-zinc-700 dark:text-stone-200">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
        <span>Entendo que é definitivo.</span>
      </label>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Excluindo..." : "Excluir definitivamente"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/20"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

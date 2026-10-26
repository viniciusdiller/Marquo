"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { purgeTenantDataAction } from "../../actions";

// Confirmação em duas travas: digitar o endereço EXATO do negócio e marcar que entende que é irreversível. O motivo é
// opcional (vai para a auditoria). O backend revalida tudo; isto só impede o clique sem olhar.
export function DeleteTenantForm({ tenantId, slug }: { tenantId: string; slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmSlug, setConfirmSlug] = useState("");
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOk = reason.trim().length === 0 || reason.trim().length >= 10;
  const canSubmit = confirmSlug.trim() === slug && understood && reasonOk && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await purgeTenantDataAction(tenantId, confirmSlug, reason);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível excluir.");
        return;
      }
      router.replace("/plataforma/negocios");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Input
        label={`Digite o endereço do negócio para confirmar: ${slug}`}
        name="confirmSlug"
        value={confirmSlug}
        onChange={(e) => setConfirmSlug(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deletion-reason" className="text-sm font-medium text-zinc-700 dark:text-stone-200">
          Motivo (opcional)
        </label>
        <textarea
          id="deletion-reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={300}
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <p className="text-xs text-zinc-400 dark:text-stone-500">
          Vai para a auditoria. Se informado, de 10 a 300 caracteres e sem dados pessoais (ex.: &quot;pedido do titular em 22/10&quot;).
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-stone-200">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1" />
        <span>Entendo que a exclusão é definitiva e não pode ser desfeita.</span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="self-start bg-red-600 hover:bg-red-700 disabled:opacity-50">
        {pending ? "Excluindo..." : "Excluir os dados definitivamente"}
      </Button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { setClubEnabledAction } from "./actions";

// Liga ou desliga o clube do negócio. Desligar não apaga nada (pacotes e adesões ficam guardados), mas a cobertura nas
// comandas para: por isso pede confirmação.
export function ClubToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    startTransition(async () => {
      const result = await setClubEnabledAction(next);
      if (result.error) setError(result.error);
      else {
        setError(null);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {enabled ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300 ring-inset transition-colors hover:bg-zinc-900/5 dark:text-stone-200 dark:ring-white/20 dark:hover:bg-white/10"
        >
          Desligar o clube
        </button>
      ) : (
        <Button type="button" disabled={pending} onClick={() => change(true)} className="px-5 py-2.5 text-sm disabled:opacity-60">
          {pending ? "Ativando..." : "Ativar o clube"}
        </Button>
      )}
      {error && !confirming ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Desligar o clube de assinaturas?"
        description="Os pacotes e as adesões ficam guardados, mas, enquanto estiver desligado, os serviços dos membros voltam a ser cobrados normalmente nas comandas."
        confirmLabel="Desligar"
        tone="danger"
        onConfirm={() => change(false)}
        isLoading={pending}
        errorMessage={error}
      />
    </div>
  );
}

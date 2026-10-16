"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cancelSubscriptionAction } from "./actions";

export function CancelButton({ untilLabel }: { untilLabel: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-xl px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-50 dark:text-red-300 dark:ring-red-500/40 dark:hover:bg-red-500/10"
      >
        Cancelar assinatura
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar a assinatura?"
        description={
          untilLabel
            ? `A cobrança é encerrada e você mantém o acesso até ${untilLabel}. Depois dessa data o painel é bloqueado até você assinar de novo.`
            : "A cobrança é encerrada. O acesso segue até o fim do período já pago."
        }
        confirmLabel="Cancelar assinatura"
        tone="danger"
        isLoading={pending}
        errorMessage={error}
        onConfirm={() =>
          startTransition(async () => {
            const result = await cancelSubscriptionAction();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

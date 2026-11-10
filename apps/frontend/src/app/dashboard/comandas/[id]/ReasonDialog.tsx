"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const MIN_REASON = 3;
const MAX_REASON = 200;

// Confirmação que EXIGE um motivo (estornar pagamento, reabrir comanda fechada): o motivo vai para o histórico da comanda, que só o
// dono vê. O backend revalida (3 a 200 caracteres); aqui o botão só habilita com um motivo que ele aceitaria.
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isLoading,
  errorMessage,
  placeholder = "Ex.: valor digitado errado",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  placeholder?: string;
}) {
  const [reason, setReason] = useState("");
  // Cada vez que o diálogo ABRE, o campo começa vazio (ajuste durante o render, no lugar de setState em efeito).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel="Voltar"
      tone="danger"
      onConfirm={() => valid && onConfirm(trimmed)}
      confirmDisabled={!valid}
      isLoading={isLoading}
      errorMessage={errorMessage}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-stone-200">
        Motivo (obrigatório)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON}
          rows={2}
          placeholder={placeholder}
          className="resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
      </label>
    </ConfirmDialog>
  );
}

"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import clsx from "clsx";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" pra ação irreversível/financeira (botão vermelho); "neutral" pro resto. */
  tone?: "danger" | "neutral";
  onConfirm: () => void;
  isLoading?: boolean;
  /** Erro da última tentativa de confirmar — mostrado dentro do diálogo, sem fechar. */
  errorMessage?: string | null;
  /** Conteúdo extra entre a descrição e os botões (ex.: campo de motivo). */
  children?: ReactNode;
  /** Mantém o botão de confirmar desabilitado (ex.: motivo ainda não preenchido). */
  confirmDisabled?: boolean;
}

// Nenhuma ação destrutiva do dashboard (cancelar atendimento/comanda, fechar caixa,
// desativar serviço/profissional, remover foto...) tinha confirmação — um clique e
// pronto, sem volta. Este componente centraliza esse "tem certeza?" pra reaproveitar em
// todos esses pontos. Portal pro body (mesmo padrão do MobileSidebar) evita depender de
// nenhum ancestral específico — quem chama pode estar em qualquer profundidade da árvore.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "neutral",
  onConfirm,
  isLoading = false,
  errorMessage,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isLoading, onOpenChange]);

  const dialog = (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="presentation"
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
          onClick={() => !isLoading && onOpenChange(false)}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={description ? "confirm-dialog-description" : undefined}
            initial={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="confirm-dialog-title"
              className="font-display text-lg font-bold text-zinc-900 dark:text-white"
            >
              {title}
            </h2>
            {description ? (
              <p
                id="confirm-dialog-description"
                className="mt-2 text-sm text-zinc-600 dark:text-stone-300"
              >
                {description}
              </p>
            ) : null}

            {children ? <div className="mt-3">{children}</div> : null}

            {errorMessage ? (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
                className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-white/15 dark:text-stone-200"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading || confirmDisabled}
                className={clsx(
                  "flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50",
                  tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-accent-500 hover:bg-accent-600",
                )}
              >
                {isLoading ? "Aguarde..." : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : null;
}

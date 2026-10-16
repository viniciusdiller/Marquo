"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attemptStatusAction, syncBillingAction } from "./actions";

// Ao voltar do checkout do cartão (?checkout=cartao&tentativa=...): o Mercado Pago pode demorar alguns segundos
// para autorizar. Consulta a tentativa (o backend relê o provedor) até confirmar ou desistir, e atualiza a tela.
export function ReturnSync({ attemptId }: { attemptId: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "approved" | "pending" | "failed">("checking");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < 10 && !cancelled; i += 1) {
        const result = attemptId ? await attemptStatusAction(attemptId) : null;
        if (result?.ok && result.attempt.status === "APPROVED") {
          setState("approved");
          router.refresh();
          return;
        }
        if (result?.ok && (result.attempt.status === "FAILED" || result.attempt.status === "EXPIRED")) {
          setState("failed");
          return;
        }
        if (!attemptId) await syncBillingAction();
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!cancelled) setState("pending");
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, router]);

  const text =
    state === "approved"
      ? "Assinatura confirmada! Seu plano já está ativo."
      : state === "failed"
        ? "O pagamento não foi concluído. Nada foi cobrado; você pode tentar de novo."
        : state === "pending"
          ? "Ainda estamos aguardando a confirmação do Mercado Pago. Isso pode levar alguns minutos; volte a esta tela depois."
          : "Confirmando o seu pagamento...";

  return (
    <p
      role="status"
      className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-stone-300"
    >
      {text}
    </p>
  );
}

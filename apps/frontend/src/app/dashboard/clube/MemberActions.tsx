"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cancelClubMemberAction, renewClubMemberAction } from "./actions";

type Pending = "renew" | "cancel" | null;

// Renovar = o cliente pagou mais um mês (fora do sistema): abre um mês novo e lança a receita. Cancelar perde os usos que
// sobraram. As duas coisas pedem confirmação porque mexem em dinheiro/saldo e não têm volta.
export function MemberActions({
  id,
  clientName,
  priceLabel,
  canRenew,
}: {
  id: string;
  clientName: string;
  priceLabel: string;
  canRenew: boolean;
}) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(kind: Exclude<Pending, null>) {
    startTransition(async () => {
      const result = kind === "renew" ? await renewClubMemberAction(id) : await cancelClubMemberAction(id);
      if (result.error) setError(result.error);
      else {
        setError(null);
        setConfirm(null);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {canRenew ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirm("renew");
          }}
          className="text-xs font-semibold text-accent-600 hover:underline dark:text-accent-300"
        >
          Renovar
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirm("cancel");
        }}
        className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
      >
        Cancelar
      </button>

      <ConfirmDialog
        open={confirm === "renew"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Renovar o mês de ${clientName}?`}
        description={`Confirma que ${clientName} pagou ${priceLabel}? Abre um mês novo a partir de hoje, zera os usos e lança o valor como receita paga no Financeiro.`}
        confirmLabel="Marcar como pago"
        onConfirm={() => run("renew")}
        isLoading={pending}
        errorMessage={confirm === "renew" ? error : null}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Cancelar a adesão de ${clientName}?`}
        description="Os usos que sobraram no mês se perdem e o cliente volta a pagar os serviços normalmente. Não devolve dinheiro: se precisar estornar, cancele o lançamento no Financeiro."
        confirmLabel="Cancelar adesão"
        tone="danger"
        onConfirm={() => run("cancel")}
        isLoading={pending}
        errorMessage={confirm === "cancel" ? error : null}
      />
    </div>
  );
}

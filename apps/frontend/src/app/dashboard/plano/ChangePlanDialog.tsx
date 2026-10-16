"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { type BillingMethod, type PlanInfo, formatBRL } from "@/lib/billing";
import { changePlanAction } from "./actions";

// Troca de plano de quem já assina. O backend é quem decide: se a equipe ativa não couber no plano novo, ele
// recusa e a mensagem (com os números) aparece aqui. A tela só explica o que acontece.
export function ChangePlanDialog({
  from,
  to,
  method,
  onClose,
}: {
  from: PlanInfo;
  to: PlanInfo;
  method: BillingMethod;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const downgrade = to.priceCents < from.priceCents;

  const when = method === "CARD_RECURRING" ? "a partir da próxima cobrança" : "a partir do próximo Pix";
  const limit = to.maxProfessionals === null ? "profissionais ilimitados" : `até ${to.maxProfessionals} profissionais ativos`;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={done ? "Plano alterado" : `${downgrade ? "Reduzir" : "Mudar"} para o plano ${to.name}?`}
      description={
        done ??
        `O plano ${to.name} (${formatBRL(to.priceCents)}/mês) permite ${limit} e vale agora. O novo valor é cobrado ${when}; o que você já pagou neste período não é devolvido nem cobrado de novo.${
          downgrade && to.maxProfessionals !== null
            ? ` Se você tem mais de ${to.maxProfessionals} profissionais ativos, não é possível reduzir: desative o excedente antes.`
            : ""
        }`
      }
      confirmLabel={done ? "Fechar" : "Trocar de plano"}
      cancelLabel={done ? "Fechar" : "Cancelar"}
      isLoading={pending}
      errorMessage={error}
      onConfirm={() => {
        if (done) {
          onClose();
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await changePlanAction(to.tier);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(`Agora você está no plano ${result.planName}. ${result.effective}`);
          router.refresh();
        });
      }}
    />
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { type PlanInfo, formatBRL } from "@/lib/billing";
import { hasCpfOrCnpjLength } from "@/lib/masks";
import { PixPanel } from "./PixPanel";
import { changePlanAction, quoteChangePlanAction, type ChangePlanQuoteView, type PixView } from "./actions";

// Troca de plano de quem já assina. O backend decide TUDO: se o plano é mais caro, ele calcula a diferença proporcional e gera
// o Pix (o plano só sobe quando o pagamento for confirmado, nunca por esta tela); se é mais barato, vale na hora e a equipe
// ativa precisa caber (a mensagem com os números vem dele). A tela só mostra o valor que o servidor calculou.
export function ChangePlanDialog({
  from,
  to,
  onClose,
}: {
  from: PlanInfo;
  to: PlanInfo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<ChangePlanQuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pix, setPix] = useState<PixView | null>(null);
  // Só aparece se o backend avisar que ainda não tem cliente no provedor para cobrar a diferença.
  const [needsDocument, setNeedsDocument] = useState(false);
  const [document, setDocument] = useState("");
  const [pending, startTransition] = useTransition();
  const downgrade = to.priceCents < from.priceCents;

  useEffect(() => {
    let cancelled = false;
    quoteChangePlanAction(to.tier).then((result) => {
      if (cancelled) return;
      if (result.ok) setQuote(result.quote);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [to.tier]);

  const limit = to.maxProfessionals === null ? "profissionais ilimitados" : `até ${to.maxProfessionals} profissionais ativos`;

  if (pix) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 cursor-default bg-zinc-950/50" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pagar a diferença para o plano ${to.name}`}
          className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
        >
          {done ? (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Pagamento confirmado!</h2>
              <p className="text-sm text-zinc-600 dark:text-stone-300">{done}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
              >
                Fechar
              </button>
            </div>
          ) : (
            <PixPanel
              pix={pix}
              title={`Pague a diferença para o plano ${to.name}`}
              intro="Este é só o valor proporcional aos dias que faltam do seu mês. O plano novo vale assim que o Pix for confirmado, e a confirmação é automática."
              onClose={onClose}
              onPaid={() => {
                setDone(`Agora você está no plano ${to.name}.`);
                router.refresh();
              }}
              onFailed={(message) => {
                setPix(null);
                setError(message);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  const pays = quote?.kind === "PAYMENT";
  const description = done
    ? done
    : !quote
      ? error
        ? undefined
        : "Calculando..."
      : pays
        ? `Para mudar para o plano ${to.name} (${formatBRL(to.priceCents)}/mês, ${limit}) você paga agora só a diferença proporcional aos ${quote.remainingDays} dia(s) que faltam do seu mês: ${formatBRL(quote.chargeCents ?? 0)}. O plano novo vale assim que o Pix for confirmado; a partir do próximo ciclo o valor é ${formatBRL(to.priceCents)}/mês.`
        : `O plano ${to.name} (${formatBRL(to.priceCents)}/mês) permite ${limit} e vale agora. ${quote.effective} O que você já pagou neste período não é devolvido.${
            downgrade && to.maxProfessionals !== null
              ? ` Se você tem mais de ${to.maxProfessionals} profissionais ativos, não é possível reduzir: desative o excedente antes.`
              : ""
          }`;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={done ? "Plano alterado" : `${downgrade ? "Reduzir" : "Mudar"} para o plano ${to.name}?`}
      description={description}
      confirmLabel={done ? "Fechar" : pays ? "Gerar Pix da diferença" : "Trocar de plano"}
      cancelLabel={done ? "Fechar" : "Cancelar"}
      isLoading={pending}
      errorMessage={error}
      confirmDisabled={!done && (!quote || (needsDocument && !hasCpfOrCnpjLength(document)))}
      onConfirm={() => {
        if (done) {
          onClose();
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await changePlanAction(to.tier, needsDocument ? document : undefined);
          if (!result.ok) {
            // O backend só pede o documento quando não conhece o cliente no provedor.
            if (/CPF ou CNPJ/i.test(result.error)) setNeedsDocument(true);
            setError(result.error);
            return;
          }
          if (result.outcome.applied) {
            setDone(`Agora você está no plano ${result.outcome.planName}. ${result.outcome.effective}`);
            router.refresh();
            return;
          }
          setPix(result.outcome.pix);
        });
      }}
    >
      {needsDocument ? (
        <MaskedInput
          mask="cpfCnpj"
          name="cpfCnpj"
          label="CPF ou CNPJ de quem paga"
          hint="Exigido para emitir a cobrança. Vai direto ao Asaas e não fica salvo no Marquo."
          value={document}
          onChange={setDocument}
          placeholder="000.000.000-00"
        />
      ) : null}
    </ConfirmDialog>
  );
}

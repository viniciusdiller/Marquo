"use client";

import { useId, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { formatCentsBRL } from "@/lib/masks";
import { brl } from "@/lib/money";
import { registerPayoutAction } from "./actions";
import { DatePicker } from "@/components/ui/date-picker";

const TZ = "America/Sao_Paulo";
// Mesmo teto do servidor (366 dias). O servidor revalida: isto só evita mandar o que ele recusaria.
const MAX_BACKDATE_DAYS = 366;

// UUID por abertura do diálogo: se a mesma requisição for reenviada (duplo clique, retry de rede), o
// servidor devolve o repasse já criado em vez de pagar de novo. Sem crypto.randomUUID (página em HTTP
// fora de localhost) segue sem chave — o botão desabilitado durante o envio continua protegendo.
function newRequestKey(): string | undefined {
  try {
    return globalThis.crypto?.randomUUID?.();
  } catch {
    return undefined;
  }
}

// Registra um repasse (pagamento da comissão) a um profissional. O valor sugerido é o saldo
// inteiro, mas o dono pode pagar menos; o servidor recusa mais que o saldo (aqui é só conforto).
export function PayoutButton({
  professionalId,
  name,
  balanceCents,
}: {
  professionalId: string;
  name: string;
  balanceCents: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // O botão é renderizado na tabela (desktop) e no cartão (mobile): o id precisa ser único por instância.
  const titleId = useId();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const requestKey = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (balanceCents <= 0) {
    return <span className="text-sm text-zinc-300 dark:text-stone-600">—</span>;
  }

  function open() {
    setAmount(formatCentsBRL(balanceCents));
    setNote("");
    setError(null);
    // Data do pagamento já vem preenchida com HOJE (fuso de São Paulo, não o do navegador).
    setPaidOn(DateTime.now().setZone(TZ).toISODate()!);
    requestKey.current = newRequestKey();
    dialogRef.current?.showModal();
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await registerPayoutAction(professionalId, amount, note, paidOn, requestKey.current);
      if (result.error) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-full border border-accent-500/40 px-3 py-1 text-xs font-semibold whitespace-nowrap text-accent-700 transition-colors hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-500/10"
      >
        Registrar repasse
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl text-left border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      >
        <h2 id={titleId} className="font-display text-lg font-bold">
          Registrar repasse para {name}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          Saldo a repassar: <strong className="text-zinc-900 dark:text-white">{brl(balanceCents)}</strong>.
          Isso lança uma despesa já paga em Financeiro e reduz o saldo. Não tem como desfazer.
        </p>

        <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-stone-200">
          Valor pago (R$)
          <MoneyInput
            value={amount}
            onChange={setAmount}
            aria-label="Valor do repasse (R$)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
          />
          <span className="text-xs font-normal text-zinc-400 dark:text-stone-500">
            Pode ser menos que o saldo; o resto continua a repassar.
          </span>
        </label>

        <div className="mt-3">
          <DatePicker
            label="Data do pagamento"
            value={paidOn}
            onChange={setPaidOn}
            max={DateTime.now().setZone(TZ).toISODate()!}
            min={DateTime.now().setZone(TZ).minus({ days: MAX_BACKDATE_DAYS }).toISODate()!}
            required
            className="px-3 py-2 text-sm"
            hint="Já vem com a data de hoje. Mude só se o pagamento foi em outro dia (nunca no futuro)."
          />
        </div>

        <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-stone-200">
          Observação (opcional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Ex.: Pix, referente a outubro"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal dark:border-white/15 dark:bg-zinc-900 dark:text-white"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-white/15 dark:text-stone-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={confirm}
            className="rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
          >
            {isPending ? "Registrando..." : "Confirmar repasse"}
          </button>
        </div>
      </dialog>
    </>
  );
}

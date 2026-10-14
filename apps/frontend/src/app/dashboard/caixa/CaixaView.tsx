"use client";

import { useActionState, useRef, useState } from "react";
import { DateTime } from "luxon";
import type { CashRegisterSummary } from "@totalagenda/shared-types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { riseIn } from "@/lib/stagger";
import { brl } from "@/lib/money";
import {
  cashMovementAction,
  closeCashAction,
  openCashAction,
  type CashActionState,
} from "./actions";

const MOVEMENT_LABEL: Record<string, string> = {
  OPENING: "Abertura",
  SALE: "Venda",
  WITHDRAWAL: "Sangria",
  DEPOSIT: "Suprimento",
};
const METHOD_LABEL: Record<string, string> = {
  CASH: "Dinheiro",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  PIX: "Pix",
  OTHER: "Outro",
};

const initial: CashActionState = {};

export function CaixaView({ summary }: { summary: CashRegisterSummary }) {
  const [openState, openAction, openPending] = useActionState(openCashAction, initial);
  const [moveState, moveAction, movePending] = useActionState(cashMovementAction, initial);
  const [closeState, closeFormAction, closePending] = useActionState(closeCashAction, initial);
  const closeFormRef = useRef<HTMLFormElement>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  if (!summary.open) {
    return (
      <form action={openAction} className="mt-6 max-w-sm space-y-3">
        <MaskedInput mask="money" label="Fundo de troco (R$)" name="float" defaultValue="0,00" required hint="Dinheiro que já está na gaveta agora, para dar troco. Pode ser 0,00." />
        {openState.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{openState.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={openPending}
          className="rounded-full bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
        >
          {openPending ? "Abrindo..." : "Abrir caixa"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
        <p className="text-sm text-zinc-500 dark:text-stone-400">
          Aberto{" "}
          {DateTime.fromISO(summary.register!.openedAt).setLocale("pt-BR").toRelative()} · fundo{" "}
          {brl(summary.register!.openingFloatCents)}
        </p>
        <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white">
          {brl(summary.expectedCashCents ?? 0)}{" "}
          <span className="text-sm font-normal text-zinc-400">esperado em dinheiro</span>
        </p>
        {summary.paymentsByMethod && summary.paymentsByMethod.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-500 dark:text-stone-400">
            {summary.paymentsByMethod.map((p) => (
              <li key={p.method}>
                {METHOD_LABEL[p.method] ?? p.method}: {brl(p.totalCents)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Sangria / suprimento</h2>
        <form action={moveAction} className="mt-3 flex flex-wrap items-end gap-2">
          <select
            name="kind"
            className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
          >
            <option value="WITHDRAWAL">Sangria</option>
            <option value="DEPOSIT">Suprimento</option>
          </select>
          <MoneyInput
            name="amount"
            placeholder="R$ 0,00"
            required
            aria-label="Valor (R$)"
            className="w-24 rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
          />
          <input
            name="note"
            placeholder="Motivo (opcional)"
            className="min-w-40 flex-1 rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={movePending}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/15 dark:text-stone-200"
          >
            {movePending ? "Lançando..." : "Lançar"}
          </button>
        </form>
        {moveState.error ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{moveState.error}</p>
        ) : null}

        {summary.movements && summary.movements.length > 0 ? (
          <ul className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-white/5">
            {summary.movements.map((m, i) => (
              <li
                key={m.id}
                style={riseIn(i)}
                className="animate-rise-in flex justify-between py-2"
              >
                <span className="text-zinc-600 dark:text-stone-300">
                  {MOVEMENT_LABEL[m.kind] ?? m.kind}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
                <span
                  className={
                    m.kind === "WITHDRAWAL"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-600 dark:text-stone-300"
                  }
                >
                  {m.kind === "WITHDRAWAL" ? "−" : "+"}
                  {brl(m.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Fechar caixa</h2>
        <form ref={closeFormRef} action={closeFormAction} className="mt-3 flex flex-wrap items-end gap-2">
          <MaskedInput mask="money" label="Dinheiro contado (R$)" name="counted" required hint="Conte as notas e moedas da gaveta. O sistema mostra a diferença para o esperado." />
          <button
            type="submit"
            disabled={closePending}
            onClick={(event) => {
              // Fechar caixa não tem volta (não dá pra reabrir ou editar os lançamentos
              // depois) — sem isto era um clique só. Sem JS o form ainda funciona: o
              // preventDefault só roda se o handler executar.
              event.preventDefault();
              setConfirmingClose(true);
            }}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {closePending ? "Fechando..." : "Fechar"}
          </button>
        </form>
        {closeState.error ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{closeState.error}</p>
        ) : null}
        {closeState.closeResult ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-stone-200">
            Esperado {brl(closeState.closeResult.expectedCashCents)} · diferença{" "}
            <span
              className={
                closeState.closeResult.differenceCents === 0
                  ? ""
                  : closeState.closeResult.differenceCents > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
              }
            >
              {brl(closeState.closeResult.differenceCents)}
            </span>
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        title="Fechar o caixa?"
        description="Confira o valor contado antes de confirmar — depois de fechado não dá pra reabrir nem editar os lançamentos deste caixa."
        confirmLabel="Fechar caixa"
        cancelLabel="Voltar"
        tone="neutral"
        onConfirm={() => {
          setConfirmingClose(false);
          closeFormRef.current?.requestSubmit();
        }}
      />
    </div>
  );
}

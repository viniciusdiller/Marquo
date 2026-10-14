"use client";

import { useActionState, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { riseIn } from "@/lib/stagger";
import { brl } from "@/lib/money";
import type {
  CashFlowReport,
  DreReport,
  FinanceOverview,
  FinancialCategory,
  FinancialEntry,
  StaffRole,
} from "@marquo/shared-types";
import {
  cancelEntryAction,
  createEntryAction,
  fetchCashFlowAction,
  fetchDreAction,
  settleEntryAction,
  type FinanceActionState,
} from "./actions";

const TABS = ["Lançamentos", "A pagar", "A receber", "Fluxo de caixa", "DRE"] as const;
type Tab = (typeof TABS)[number];

const initial: FinanceActionState = {};

export function FinanceView({
  overview,
  entries,
  categories,
  role,
}: {
  overview: FinanceOverview;
  entries: FinancialEntry[];
  categories: FinancialCategory[];
  role: StaffRole;
}) {
  const [tab, setTab] = useState<Tab>("Lançamentos");
  const [state, formAction, pending] = useActionState(createEntryAction, initial);
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [, startTransition] = useTransition();

  const [cf, setCf] = useState<CashFlowReport | null>(null);
  const [dre, setDre] = useState<DreReport | null>(null);
  const [reportPending, startReport] = useTransition();
  const [from, setFrom] = useState(DateTime.now().startOf("month").toISODate()!);
  const [to, setTo] = useState(DateTime.now().endOf("month").toISODate()!);
  const [confirmingAction, setConfirmingAction] = useState<{
    entry: FinancialEntry;
    kind: "settle" | "cancel";
  } | null>(null);

  const isOwner = role === "OWNER";
  const payables = entries.filter((e) => e.direction === "EXPENSE" && e.status === "PENDING");
  const receivables = entries.filter((e) => e.direction === "INCOME" && e.status === "PENDING");

  function loadReports() {
    const f = DateTime.fromISO(from).startOf("day").toISO()!;
    const t = DateTime.fromISO(to).endOf("day").toISO()!;
    startReport(async () => {
      setCf(await fetchCashFlowAction(f, t));
      if (isOwner) setDre(await fetchDreAction(f, t));
    });
  }

  function EntryList({ items }: { items: FinancialEntry[] }) {
    if (items.length === 0)
      return (
        <div className="mt-4">
          <EmptyState icon={Receipt} title="Nada por aqui" />
        </div>
      );
    return (
      <ul className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-white/5">
        {items.map((e, i) => {
          const overdue = e.status === "PENDING" && DateTime.fromISO(e.dueDate) < DateTime.now();
          return (
            <li
              key={e.id}
              style={riseIn(i)}
              className="animate-rise-in flex items-center justify-between gap-3 py-2.5"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-white">{e.description}</p>
                <p className="text-xs text-zinc-400">
                  {e.category?.name ?? "Sem categoria"}
                  {e.counterparty ? ` · ${e.counterparty}` : ""} · vence{" "}
                  {DateTime.fromISO(e.dueDate).toFormat("dd/LL/yyyy")}
                  {e.source !== "MANUAL" ? " · auto" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    e.direction === "INCOME"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-700 dark:text-stone-200"
                  }
                >
                  {e.direction === "INCOME" ? "+" : "−"}
                  {brl(e.amountCents)}
                </span>
                {e.status === "PAID" ? (
                  <span className="text-xs text-zinc-400">quitado</span>
                ) : e.status === "CANCELED" ? (
                  <span className="text-xs text-zinc-400">cancelado</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmingAction({ entry: e, kind: "settle" })}
                      className={
                        overdue
                          ? "rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white"
                          : "rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-white/15 dark:text-stone-200"
                      }
                    >
                      Dar baixa
                    </button>
                    {e.source === "MANUAL" ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingAction({ entry: e, kind: "cancel" })}
                        className="text-xs text-zinc-400 hover:text-red-500"
                      >
                        cancelar
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-5 xl:col-span-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card
            label="A receber"
            value={brl(overview.receivableCents)}
            hint={overview.receivableOverdueCents ? `${brl(overview.receivableOverdueCents)} vencido` : undefined}
          />
          <Card
            label="A pagar"
            value={brl(overview.payableCents)}
            hint={overview.payableOverdueCents ? `${brl(overview.payableOverdueCents)} vencido` : undefined}
          />
          <Card label="Entrou no mês" value={brl(overview.monthIncomeCents)} />
          <Card label="Resultado do mês" value={brl(overview.monthNetCents)} />
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/30">
          <h2 className="mb-4 font-semibold text-zinc-900 dark:text-white">Novo Lançamento</h2>
          <form action={formAction} className="grid gap-2 sm:grid-cols-2">
            <select
              name="direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "INCOME" | "EXPENSE")}
              className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-white"
            >
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </select>
            <select name="categoryId" className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-white">
              <option value="">Sem categoria</option>
              {categories
                .filter((c) => c.direction === direction && !c.isArchived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <input name="description" placeholder="Descrição" required maxLength={200} className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-white sm:col-span-2" />
            <input name="counterparty" placeholder="Fornecedor / cliente (opcional)" maxLength={200} className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-white sm:col-span-2" />
            <MoneyInput name="amount" placeholder="Valor (R$)" aria-label="Valor (R$)" required className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-white" />
            <input name="dueDate" type="date" required defaultValue={DateTime.now().toISODate()!} className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-white" />
            <label className="flex items-center gap-2 text-sm text-zinc-600 sm:col-span-2 dark:text-stone-300">
              <input type="checkbox" name="paidNow" /> Já quitado
            </label>
            {state.error ? (
              <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{state.error}</p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="mt-2 w-full rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50 sm:col-span-2"
            >
              {pending ? "Salvando..." : "Lançar"}
            </button>
          </form>
        </div>
      </div>

      <div className="flex min-w-0 flex-col lg:col-span-7 xl:col-span-8">
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-white/10">
          {TABS.filter((t) => t !== "DRE" || isOwner).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                if ((t === "Fluxo de caixa" || t === "DRE") && !cf) loadReports();
              }}
              className={
                tab === t
                  ? "border-b-2 border-accent-500 px-3 py-2 text-sm font-medium text-accent-700 dark:text-accent-300"
                  : "px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
              }
            >
              {t}
            </button>
          ))}
        </div>

      {tab === "Lançamentos" ? (
        <EntryList items={entries} />
      ) : null}

      {tab === "A pagar" ? <EntryList items={payables} /> : null}
      {tab === "A receber" ? <EntryList items={receivables} /> : null}

      {tab === "Fluxo de caixa" || tab === "DRE" ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-end gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white" />
            <button type="button" onClick={loadReports} disabled={reportPending} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-white/15 dark:text-stone-200">
              {reportPending ? "..." : "Atualizar"}
            </button>
          </div>

          {tab === "Fluxo de caixa" && cf ? (
            <div className="mt-4 text-sm">
              <div className="flex justify-between border-b border-zinc-200 py-2 font-semibold dark:border-white/10">
                <span>Resultado (realizado)</span>
                <span className={cf.netCents >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                  {brl(cf.netCents)}
                </span>
              </div>
              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
                {cf.byCategory.map((c) => (
                  <li key={`${c.direction}${c.name}`} className="flex justify-between py-1.5">
                    <span className="text-zinc-600 dark:text-stone-300">{c.name}</span>
                    <span className={c.direction === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-600 dark:text-stone-300"}>
                      {c.direction === "INCOME" ? "+" : "−"}
                      {brl(c.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tab === "DRE" && dre ? (
            <>
              <p className="mt-4 text-xs text-zinc-400 dark:text-stone-500">
                DRE (Demonstração do Resultado do Exercício) é o resumo contábil do seu
                lucro no período: quanto entrou, quanto custou o que você vendeu e o que
                sobrou. CMV (Custo da Mercadoria Vendida) é o custo de compra dos produtos
                que saíram do estoque nas vendas do período — não inclui os serviços.
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <Row label="Receita bruta" value={brl(dre.revenueCents)} />
                <Row label="(−) Custo de produtos (CMV)" value={brl(dre.cogsCents)} />
                <Row label="= Lucro bruto" value={brl(dre.grossProfitCents)} bold />
                {dre.expensesByCategory.map((e) => (
                  <Row key={e.name} label={`(−) ${e.name}`} value={brl(e.totalCents)} />
                ))}
                <Row label="= Resultado" value={brl(dre.resultCents)} bold />
              </dl>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingAction !== null}
        onOpenChange={(open) => !open && setConfirmingAction(null)}
        title={confirmingAction?.kind === "cancel" ? "Cancelar este lançamento?" : "Dar baixa neste lançamento?"}
        description={
          confirmingAction
            ? confirmingAction.kind === "cancel"
              ? `"${confirmingAction.entry.description}" (${brl(confirmingAction.entry.amountCents)}) é descartado. Não tem como desfazer.`
              : `Marca "${confirmingAction.entry.description}" (${brl(confirmingAction.entry.amountCents)}) como pago/recebido. Não tem "desfazer baixa" — se for engano, é preciso lançar de novo.`
            : undefined
        }
        confirmLabel={confirmingAction?.kind === "cancel" ? "Cancelar lançamento" : "Dar baixa"}
        cancelLabel="Voltar"
        tone={confirmingAction?.kind === "cancel" ? "danger" : "neutral"}
        onConfirm={() => {
          if (!confirmingAction) return;
          const { entry, kind } = confirmingAction;
          setConfirmingAction(null);
          startTransition(() =>
            void (kind === "cancel" ? cancelEntryAction(entry.id) : settleEntryAction(entry.id)),
          );
        }}
      />
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={
        bold
          ? "flex justify-between border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-white/10 dark:text-white"
          : "flex justify-between text-zinc-600 dark:text-stone-300"
      }
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

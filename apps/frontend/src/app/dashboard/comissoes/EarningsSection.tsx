import Link from "next/link";
import clsx from "clsx";
import { Users } from "@phosphor-icons/react/dist/ssr";
import type { EarningsReport, ProfessionalEarnings } from "@marquo/shared-types";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PRESET_LABEL, type EarningsPeriod } from "@/lib/earnings-period";
import { brl } from "@/lib/money";
import { riseIn } from "@/lib/stagger";
import { PayoutButton } from "./PayoutButton";

const BASE = "/dashboard/comissoes";

function PeriodBar({ period }: { period: EarningsPeriod }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <nav aria-label="Período" className="flex flex-wrap gap-1.5">
        {(Object.keys(PRESET_LABEL) as Array<keyof typeof PRESET_LABEL>).map((key) => (
          <Link
            key={key}
            href={`${BASE}?periodo=${key}`}
            aria-current={period.preset === key ? "page" : undefined}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              period.preset === key
                ? "bg-accent-500 text-white"
                : "text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/15 dark:hover:bg-white/5",
            )}
          >
            {PRESET_LABEL[key]}
          </Link>
        ))}
      </nav>

      {/* GET: o período fica na URL, a página segue Server Component e o link é compartilhável */}
      <form method="get" action={BASE} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="date"
          name="de"
          defaultValue={period.fromDate}
          aria-label="Data inicial"
          className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <span className="text-zinc-400">até</span>
        <input
          type="date"
          name="ate"
          defaultValue={period.toDate}
          aria-label="Data final"
          className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <button
          type="submit"
          className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium transition-colors hover:bg-zinc-900/5 dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/5"
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}

const money = "text-right tabular-nums";

function Row({ row, index }: { row: ProfessionalEarnings; index: number }) {
  return (
    <tr style={riseIn(index)} className="animate-rise-in border-b border-zinc-100 last:border-0 dark:border-white/5">
      <td className="py-3 pr-3">
        <p className="font-medium text-zinc-900 dark:text-white">
          {row.name}
          {!row.isActive ? <span className="ml-2 text-xs font-normal text-zinc-400">inativo</span> : null}
        </p>
        <p className="text-xs text-zinc-400">
          {row.ticketCount} {row.ticketCount === 1 ? "comanda" : "comandas"}
        </p>
      </td>
      <td className={clsx(money, "px-2 py-3 text-zinc-700 dark:text-stone-200")}>{brl(row.grossCents)}</td>
      <td className={clsx(money, "px-2 py-3 text-zinc-400")}>
        {row.discountCents > 0 ? `− ${brl(row.discountCents)}` : "—"}
      </td>
      <td className={clsx(money, "px-2 py-3 font-semibold text-zinc-900 dark:text-white")}>
        {brl(row.netCents)}
      </td>
      <td className={clsx(money, "px-2 py-3 text-zinc-700 dark:text-stone-200")}>{brl(row.commissionCents)}</td>
      <td className={clsx(money, "px-2 py-3 text-zinc-700 dark:text-stone-200")}>{brl(row.houseCents)}</td>
      <td className={clsx(money, "px-2 py-3 font-semibold", row.payableBalanceCents > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-400")}>
        {brl(row.payableBalanceCents)}
      </td>
      <td className="py-3 pl-2 text-right">
        <PayoutButton professionalId={row.professionalId} name={row.name} balanceCents={row.payableBalanceCents} />
      </td>
    </tr>
  );
}

// Cartão (mobile): a tabela com 8 colunas não cabe em tela de celular.
function MobileCard({ row, index }: { row: ProfessionalEarnings; index: number }) {
  const lines: Array<[string, string, boolean?]> = [
    ["Bruto", brl(row.grossCents)],
    ["Descontos", row.discountCents > 0 ? `− ${brl(row.discountCents)}` : "—"],
    ["Líquido", brl(row.netCents), true],
    ["Repasse", brl(row.commissionCents)],
    ["Sobra da casa", brl(row.houseCents)],
  ];
  return (
    <li
      style={riseIn(index)}
      className="animate-rise-in rounded-2xl border border-zinc-200 p-4 dark:border-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-zinc-400">
            {row.ticketCount} {row.ticketCount === 1 ? "comanda" : "comandas"}
          </p>
        </div>
        <PayoutButton professionalId={row.professionalId} name={row.name} balanceCents={row.payableBalanceCents} />
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        {lines.map(([label, value, bold]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-zinc-500 dark:text-stone-400">{label}</dt>
            <dd className={clsx("tabular-nums", bold ? "font-semibold text-zinc-900 dark:text-white" : "text-zinc-700 dark:text-stone-200")}>
              {value}
            </dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-zinc-100 pt-1 dark:border-white/5">
          <dt className="text-zinc-500 dark:text-stone-400">A repassar</dt>
          <dd className={clsx("font-semibold tabular-nums", row.payableBalanceCents > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-400")}>
            {brl(row.payableBalanceCents)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function EarningsSection({
  report,
  period,
}: {
  report: EarningsReport | null;
  period: EarningsPeriod;
}) {
  return (
    <section aria-labelledby="equipe-heading">
      <h2 id="equipe-heading" className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
        Faturamento da equipe
      </h2>
      <div className="mt-3">
        <PeriodBar period={period} />
      </div>

      {!report ? (
        <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar o faturamento agora. Tente novamente em instantes.
        </p>
      ) : report.professionals.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="Nenhum profissional ativo"
            description="Cadastre profissionais para acompanhar o faturamento de cada um."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Faturamento bruto" value={brl(report.totals.grossCents)} hint={`${report.totals.ticketCount} ${report.totals.ticketCount === 1 ? "comanda" : "comandas"}`} tone="muted" />
            <Card label="Faturamento líquido" value={brl(report.totals.netCents)} hint={report.totals.discountCents > 0 ? `após ${brl(report.totals.discountCents)} de desconto` : "sem descontos"} tone="muted" />
            <Card label="Repasse no período" value={brl(report.totals.commissionCents)} hint={`sobra ${brl(report.totals.houseCents)} p/ a casa`} tone="muted" />
            <Card label="A repassar (acumulado)" value={brl(report.totals.payableBalanceCents)} hint={report.totals.payableBalanceCents > 0 ? "saldo em aberto" : undefined} />
          </div>

          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-zinc-400">
                <tr className="border-b border-zinc-200 dark:border-white/10">
                  <th className="py-2 pr-3 font-medium">Barbeiro</th>
                  <th className={clsx(money, "px-2 py-2 font-medium")}>Bruto</th>
                  <th className={clsx(money, "px-2 py-2 font-medium")}>Descontos</th>
                  <th className={clsx(money, "px-2 py-2 font-medium")}>Líquido</th>
                  <th className={clsx(money, "px-2 py-2 font-medium")}>Repasse</th>
                  <th className={clsx(money, "px-2 py-2 font-medium")}>Sobra da casa</th>
                  <th className={clsx(money, "px-2 py-2 font-medium")}>A repassar</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {report.professionals.map((row, i) => (
                  <Row key={row.professionalId} row={row} index={i} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 font-semibold text-zinc-900 dark:border-white/10 dark:text-white">
                  <td className="py-3 pr-3">Total</td>
                  <td className={clsx(money, "px-2 py-3")}>{brl(report.totals.grossCents)}</td>
                  <td className={clsx(money, "px-2 py-3 text-zinc-400")}>
                    {report.totals.discountCents > 0 ? `− ${brl(report.totals.discountCents)}` : "—"}
                  </td>
                  <td className={clsx(money, "px-2 py-3")}>{brl(report.totals.netCents)}</td>
                  <td className={clsx(money, "px-2 py-3")}>{brl(report.totals.commissionCents)}</td>
                  <td className={clsx(money, "px-2 py-3")}>{brl(report.totals.houseCents)}</td>
                  <td className={clsx(money, "px-2 py-3")}>{brl(report.totals.payableBalanceCents)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className="mt-6 flex flex-col gap-3 md:hidden">
            {report.professionals.map((row, i) => (
              <MobileCard key={row.professionalId} row={row} index={i} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

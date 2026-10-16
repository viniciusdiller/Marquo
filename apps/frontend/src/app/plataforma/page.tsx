import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { brl } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { platformFetch } from "@/lib/platform-session";
import { ROLE_LABEL, STATUS_LABEL, type PlatformOverview } from "@/lib/platform-api";

function SignupBars({ series }: { series: { date: string; count: number }[] }) {
  const max = Math.max(1, ...series.map((point) => point.count));
  return (
    <div
      role="img"
      aria-label={`Cadastros por dia nos últimos ${series.length} dias`}
      className="flex h-28 items-end gap-1"
    >
      {series.map((point) => (
        <div
          key={point.date}
          title={`${point.date.split("-").reverse().join("/")}: ${point.count}`}
          className="flex-1 rounded-t bg-accent-500/80"
          style={{ height: `${Math.max(point.count === 0 ? 2 : 8, (point.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default async function PlataformaOverviewPage() {
  const data = await platformFetch<PlatformOverview>("/platform/overview");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Visão geral"
        description={`Atualizado em ${formatDateTime(data.generatedAt)}`}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Receita mensal estimada" value={brl(data.revenue.mrrCents)} hint="Preço de tabela dos planos pagos" tone="muted" />
        <Card label="Negócios pagantes" value={String(data.revenue.payingTenants)} tone="muted" />
        <Card label="Negócios cadastrados" value={String(data.tenants.total)} hint={`${data.tenants.listedInMarketplace} no marketplace`} tone="muted" />
        <Card
          label="Testes acabando em 7 dias"
          value={String(data.tenants.trialsEndingIn7Days)}
          hint={data.tenants.trialsEndingIn7Days > 0 ? "Oportunidade de conversão" : undefined}
        />
        <Card label="Cadastros nos últimos 7 dias" value={String(data.signups.last7Days)} tone="muted" />
        <Card label="Cadastros nos últimos 30 dias" value={String(data.signups.last30Days)} tone="muted" />
        <Card label="Clientes finais" value={String(data.users.consumers)} tone="muted" />
        <Card label="Agendamentos criados (30 dias)" value={String(data.activity.appointmentsCreatedLast30Days)} tone="muted" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Negócios por estado</h2>
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/5">
            {data.tenants.byStatus.map((row) => (
              <li key={row.status} className="flex items-center justify-between py-2 text-sm">
                <Link
                  href={`/plataforma/negocios?status=${row.status}`}
                  className="text-zinc-700 hover:text-accent-600 dark:text-stone-200"
                >
                  {STATUS_LABEL[row.status] ?? row.status}
                </Link>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Receita por plano</h2>
          {data.revenue.byPlan.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500 dark:text-stone-400">Nenhuma assinatura paga ainda.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/5">
              {data.revenue.byPlan.map((row) => (
                <li key={row.planName} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-zinc-700 dark:text-stone-200">
                    {row.planName} <span className="text-zinc-400">· {row.subscribers}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{brl(row.monthlyCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Cadastros por dia (30 dias)</h2>
          <div className="mt-4">
            <SignupBars series={data.signups.series} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Usuários ativos da equipe</h2>
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/5">
            {data.users.activeByRole.map((row) => (
              <li key={row.role} className="flex items-center justify-between py-2 text-sm">
                <span className="text-zinc-700 dark:text-stone-200">{ROLE_LABEL[row.role] ?? row.role}</span>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

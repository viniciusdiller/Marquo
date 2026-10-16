import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { brl } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import { METHOD_LABEL, STATUS_LABEL, type PlatformPage, type PlatformSubscriptionRow } from "@/lib/platform-api";
import { StatusBadge } from "../StatusBadge";

const PAGE_SIZE = 20;
const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAST_DUE", "CANCELED", "INCOMPLETE", "UNPAID"] as const;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const page = parsePageParam(params.pagina);
  const validStatus = (SUBSCRIPTION_STATUSES as readonly string[]).includes(status);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (validStatus) qs.set("status", status);

  const result = await platformFetch<PlatformPage<PlatformSubscriptionRow>>(`/platform/subscriptions?${qs.toString()}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Assinaturas" description={`${result.total} encontrada${result.total === 1 ? "" : "s"}`} />

      <form method="get" className="flex flex-wrap gap-2">
        <select
          name="status"
          defaultValue={validStatus ? status : ""}
          aria-label="Estado"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">Todos os estados</option>
          {SUBSCRIPTION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600">
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Negócio</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Próxima cobrança</th>
              <th className="px-4 py-3 font-medium">Assinou em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhuma assinatura encontrada.
                </td>
              </tr>
            ) : (
              result.items.map((sub) => (
                <tr key={sub.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/plataforma/negocios/${sub.tenant.id}`} className="font-medium text-zinc-900 hover:text-accent-600 dark:text-white">
                      {sub.tenant.name}
                    </Link>
                    {sub.tenant.suspendedAt ? <p className="text-xs text-red-600 dark:text-red-400">Suspenso</p> : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                    {sub.plan.name} <span className="text-zinc-400">· {brl(sub.plan.priceCents)}/mês</span>
                    <p className="text-xs text-zinc-400">
                      {sub.courtesy ? "Cortesia" : sub.method ? METHOD_LABEL[sub.method] : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={sub.status} />
                    {sub.cancelAtPeriodEnd ? <p className="text-xs text-amber-600 dark:text-amber-400">Encerra no fim do período</p> : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-stone-400">
                    {sub.currentPeriodEnd ? formatDateTime(sub.currentPeriodEnd) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-stone-400">{formatDateTime(sub.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/assinaturas" searchParams={params} />
    </div>
  );
}

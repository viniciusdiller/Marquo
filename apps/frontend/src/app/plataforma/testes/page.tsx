import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import { trialRemainingLabel, type PlatformPage, type PlatformTrialItem } from "@/lib/platform-api";
import { TrialSetter } from "./TrialSetter";

const PAGE_SIZE = 20;
const TABS = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Em teste" },
  { value: "EXPIRED", label: "Vencidos" },
] as const;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function TestesGratisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = first(params.busca).trim().slice(0, 100);
  // Valor desconhecido na URL vira "todos" em vez de 400 na tela.
  const status = TABS.some((tab) => tab.value && tab.value === first(params.status)) ? first(params.status) : "";
  const page = parsePageParam(params.pagina);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set("search", search);
  if (status) qs.set("status", status);

  const result = await platformFetch<PlatformPage<PlatformTrialItem>>(`/platform/trials?${qs.toString()}`);

  const tabHref = (value: string) => {
    const next = new URLSearchParams();
    if (search) next.set("busca", search);
    if (value) next.set("status", value);
    const query = next.toString();
    return query ? `/plataforma/testes?${query}` : "/plataforma/testes";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Testes grátis"
        description="Negócios sem assinatura. Defina, para cada um, quanto tempo de teste ele tem a partir de hoje: para mais, para menos ou 0 para encerrar. Fica tudo na auditoria."
      />

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Estado do teste">
        {TABS.map((tab) => (
          <Link
            key={tab.value || "todos"}
            href={tabHref(tab.value)}
            role="tab"
            aria-selected={status === tab.value}
            className={clsx(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              status === tab.value
                ? "bg-accent-500 text-white"
                : "text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/20",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input
          name="busca"
          defaultValue={search}
          placeholder="Nome, endereço do link ou e-mail do dono"
          maxLength={100}
          className="min-w-64 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <button type="submit" className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Negócio</th>
              <th className="px-4 py-3 font-medium">Dono</th>
              <th className="px-4 py-3 font-medium">Teste termina em</th>
              <th className="px-4 py-3 font-medium">Restante</th>
              <th className="px-4 py-3 font-medium">Definir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhum negócio em teste encontrado.
                </td>
              </tr>
            ) : (
              result.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/plataforma/negocios/${item.id}`} className="font-medium text-zinc-900 hover:text-accent-600 dark:text-white">
                      {item.name}
                    </Link>
                    <p className="text-xs text-zinc-400">/{item.slug}</p>
                    {item.suspended ? (
                      <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">Suspenso: os dias não liberam o acesso</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                    {item.owner?.name ?? "—"}
                    <p className="text-xs text-zinc-400">{item.owner?.email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-stone-300">{formatDateTime(item.trialEndsAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={clsx(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        item.expired
                          ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                          : item.daysLeft <= 3
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
                      )}
                    >
                      {trialRemainingLabel(item)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TrialSetter tenantId={item.id} tenantName={item.name} currentDays={item.daysLeft} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/testes" searchParams={params} />
    </div>
  );
}

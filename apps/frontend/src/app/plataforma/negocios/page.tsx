import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { formatDateTime } from "@/lib/datetime";
import { formatPhoneBR } from "@/lib/masks";
import { whatsappLink } from "@/lib/whatsapp";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import { STATUS_LABEL, type PlatformPage, type PlatformTenantRow } from "@/lib/platform-api";
import { StatusBadge } from "../StatusBadge";
import { TenantActionsMenu } from "../TenantActionsMenu";

const PAGE_SIZE = 20;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = first(params.busca).trim().slice(0, 100);
  const status = first(params.status);
  const page = parsePageParam(params.pagina);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set("search", search);
  // Valor desconhecido na URL vira "sem filtro" em vez de 400 na tela.
  if (status in STATUS_LABEL) qs.set("status", status);

  const result = await platformFetch<PlatformPage<PlatformTenantRow>>(`/platform/tenants?${qs.toString()}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Negócios"
        description={`${result.total} encontrado${result.total === 1 ? "" : "s"}`}
        action={
          <Link
            href="/plataforma/negocios/novo"
            className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
          >
            Novo negócio
          </Link>
        }
      />

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="busca"
          defaultValue={search}
          placeholder="Nome, endereço do link ou e-mail do dono"
          maxLength={100}
          className="min-w-64 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <select
          name="status"
          defaultValue={status in STATUS_LABEL ? status : ""}
          aria-label="Estado"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">Todos os estados</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Negócio</th>
              <th className="px-4 py-3 font-medium">Dono</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Cadastro</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhum negócio encontrado.
                </td>
              </tr>
            ) : (
              result.items.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link
                      href={`/plataforma/negocios/${tenant.id}`}
                      className="font-medium text-zinc-900 hover:text-accent-600 dark:text-white"
                    >
                      {tenant.name}
                    </Link>
                    <p className="text-xs text-zinc-400">/{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                    {tenant.ownerName ?? "—"}
                    <p className="text-xs text-zinc-400">{tenant.ownerEmail ?? ""}</p>
                    {tenant.ownerPhone ? (
                      <p className="text-xs">
                        {whatsappLink(tenant.ownerPhone) ? (
                          <a
                            href={whatsappLink(tenant.ownerPhone) as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            {formatPhoneBR(tenant.ownerPhone)} · WhatsApp
                          </a>
                        ) : (
                          <span className="text-zinc-400">{formatPhoneBR(tenant.ownerPhone)}</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Sem telefone</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tenant.billingStatus} />
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                    {tenant.planName ?? "—"}
                    {tenant.courtesy ? (
                      <p className="text-xs text-accent-600 dark:text-accent-300">
                        Cortesia{tenant.courtesyEndsAt ? ` até ${formatDateTime(tenant.courtesyEndsAt).split(" às")[0]}` : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-stone-400">{formatDateTime(tenant.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <TenantActionsMenu
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      tenantSlug={tenant.slug}
                      suspended={tenant.suspendedAt !== null}
                      hasSubscription={tenant.planName !== null}
                      courtesy={tenant.courtesy}
                      hasActiveOwner={tenant.ownerEmail !== null}
                      ownerPhone={tenant.ownerPhone}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/negocios" searchParams={params} />
    </div>
  );
}

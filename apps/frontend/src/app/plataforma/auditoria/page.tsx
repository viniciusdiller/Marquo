import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import { AUDIT_LABEL, type PlatformAuditRow, type PlatformPage } from "@/lib/platform-api";

const PAGE_SIZE = 25;

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.pagina);

  const result = await platformFetch<PlatformPage<PlatformAuditRow>>(
    `/platform/audit?page=${page}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Auditoria"
        description="Toda ação feita pela plataforma sobre um negócio, com quem fez e quando. Nunca guarda senha nem link."
      />

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Quando</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Por</th>
              <th className="px-4 py-3 font-medium">Detalhe</th>
              <th className="px-4 py-3 font-medium">Negócio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhuma ação registrada ainda.
                </td>
              </tr>
            ) : (
              result.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-stone-400">{formatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">{AUDIT_LABEL[row.action] ?? row.action}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">{row.actor}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">{row.detail ?? "—"}</td>
                  <td className="px-4 py-3">
                    {row.tenantId ? (
                      <Link href={`/plataforma/negocios/${row.tenantId}`} className="text-accent-600 hover:underline dark:text-accent-300">
                        Abrir
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/auditoria" searchParams={params} />
    </div>
  );
}

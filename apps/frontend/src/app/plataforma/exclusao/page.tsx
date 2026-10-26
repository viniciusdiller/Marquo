import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import type { PlatformDeletionCandidate, PlatformPage } from "@/lib/platform-api";
import { StatusBadge } from "../StatusBadge";

const PAGE_SIZE = 25;

export default async function ExclusaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.pagina);

  const result = await platformFetch<PlatformPage<PlatformDeletionCandidate>>(
    `/platform/deletion/candidates?page=${page}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exclusão de dados"
        description="Negócios que deixaram de usar o Marquo. Os termos prometem apagar os dados 90 dias depois do fim do acesso. Nada é apagado sozinho: você revisa, simula e confirma, e tudo fica na auditoria."
      />

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-stone-300">
        Ao excluir, somem clientes, agenda, comandas, financeiro, equipe e fotos do negócio. Ficam apenas o registro de
        pagamento (assinatura e cobranças) e a auditoria, como os termos preveem. Não há como desfazer.
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Negócio</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acesso terminou em</th>
              <th className="px-4 py-3 font-medium">Prazo de 90 dias</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhum negócio sem acesso no momento.
                </td>
              </tr>
            ) : (
              result.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-white">{row.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-stone-400">/{row.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.billingStatus} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-stone-300">
                    {formatDateTime(row.accessEndedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.eligible ? (
                      <span className="font-semibold text-red-700 dark:text-red-300">Cumprido</span>
                    ) : (
                      <span className="text-zinc-600 dark:text-stone-300">em {formatDateTime(row.eligibleOn)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/plataforma/exclusao/${row.id}`}
                      className="font-semibold text-accent-600 hover:underline dark:text-accent-300"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/exclusao" searchParams={params} />
    </div>
  );
}

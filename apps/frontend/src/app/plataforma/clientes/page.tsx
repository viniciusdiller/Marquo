import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { formatDateTime } from "@/lib/datetime";
import { formatPhoneBR } from "@/lib/masks";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import type { PlatformConsumerRow, PlatformPage } from "@/lib/platform-api";
import { DeleteConsumerForm } from "./DeleteConsumerForm";

const PAGE_SIZE = 20;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = first(params.busca).trim().slice(0, 100);
  const page = parsePageParam(params.pagina);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set("search", search);

  const result = await platformFetch<PlatformPage<PlatformConsumerRow>>(`/platform/consumers?${qs.toString()}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes finais"
        description={`${result.total} conta${result.total === 1 ? "" : "s"} (quem agenda pelo site). Excluir apaga a conta, as sessões, o vínculo com os salões e as avaliações; a ficha de cada salão fica com o salão. Tudo vai para a auditoria.`}
      />

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="busca"
          defaultValue={search}
          placeholder="Nome, e-mail ou telefone"
          maxLength={100}
          className="min-w-64 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <button type="submit" className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Telefone</th>
              <th className="px-4 py-3 font-medium">Salões</th>
              <th className="px-4 py-3 font-medium">Criada em</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            ) : (
              result.items.map((consumer) => (
                <tr key={consumer.id} className="align-top">
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-900 dark:text-white">{consumer.name}</span>
                    <p className="text-xs text-zinc-400">{consumer.email ?? "Sem e-mail"}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-stone-300">{formatPhoneBR(consumer.phone)}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                    {consumer.salons}
                    {consumer.reviews > 0 ? <p className="text-xs text-zinc-400">{consumer.reviews} avaliaç{consumer.reviews === 1 ? "ão" : "ões"}</p> : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-stone-300">{formatDateTime(consumer.createdAt)}</td>
                  <td className="px-4 py-3">
                    <DeleteConsumerForm consumerId={consumer.id} name={consumer.name} phone={consumer.phone} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/clientes" searchParams={params} />
    </div>
  );
}

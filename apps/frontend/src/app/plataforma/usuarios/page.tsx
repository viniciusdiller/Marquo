import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import { ROLE_LABEL, type PlatformPage, type PlatformUserRow } from "@/lib/platform-api";

const PAGE_SIZE = 20;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = first(params.busca).trim().slice(0, 100);
  const role = first(params.papel);
  const page = parsePageParam(params.pagina);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set("search", search);
  if (role in ROLE_LABEL) qs.set("role", role);

  const result = await platformFetch<PlatformPage<PlatformUserRow>>(`/platform/users?${qs.toString()}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários da equipe"
        description={`${result.total} encontrado${result.total === 1 ? "" : "s"} (donos, recepção e profissionais)`}
      />

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="busca"
          defaultValue={search}
          placeholder="Nome, e-mail ou negócio"
          maxLength={100}
          className="min-w-64 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <select
          name="papel"
          defaultValue={role in ROLE_LABEL ? role : ""}
          aria-label="Papel"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">Todos os papéis</option>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Negócio</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              result.items.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-900 dark:text-white">{user.name}</span>
                    <p className="text-xs text-zinc-400">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">{ROLE_LABEL[user.role] ?? user.role}</td>
                  <td className="px-4 py-3">
                    <Link href={`/plataforma/negocios/${user.tenant.id}`} className="text-accent-600 hover:underline dark:text-accent-300">
                      {user.tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">{user.isActive ? "Ativo" : "Desativado"}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-stone-400">{formatDateTime(user.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/usuarios" searchParams={params} />
    </div>
  );
}

import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import { type PlatformPage, type PlatformUserRow } from "@/lib/platform-api";
import { OwnersTable } from "./OwnersTable";

const PAGE_SIZE = 20;
// A lista é de donos: o filtro escolhe donos cujo negócio tem alguém com esse papel.
const TEAM_FILTER: Record<string, string> = { RECEPTIONIST: "Com recepção", PROFESSIONAL: "Com profissionais" };

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
  if (role in TEAM_FILTER) qs.set("role", role);

  const result = await platformFetch<PlatformPage<PlatformUserRow>>(`/platform/users?${qs.toString()}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários da equipe"
        description={`${result.total} ${result.total === 1 ? "dono encontrado" : "donos encontrados"}. Clique na setinha para ver a equipe de cada negócio.`}
      />

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="busca"
          defaultValue={search}
          placeholder="Nome, e-mail (do dono ou da equipe) ou negócio"
          maxLength={100}
          className="min-w-64 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <select
          name="papel"
          defaultValue={role in TEAM_FILTER ? role : ""}
          aria-label="Equipe"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">Todas as equipes</option>
          {Object.entries(TEAM_FILTER).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600">
          Filtrar
        </button>
      </form>

      <OwnersTable owners={result.items} />

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/usuarios" searchParams={params} />
    </div>
  );
}

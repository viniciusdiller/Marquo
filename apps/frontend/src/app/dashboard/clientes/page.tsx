import Link from "next/link";
import { DateTime } from "luxon";
import { IdentificationCard, LockSimple, MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";
import type { AdminClientListItem } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { riseIn } from "@/lib/stagger";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (session?.user.role === "PROFESSIONAL") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-stone-300">
        <LockSimple size={18} />
        Apenas o dono e a recepção acessam a base de clientes.
      </div>
    );
  }

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const clients = await authedFetch<AdminClientListItem[]>(
    `/clients${query ? `?search=${encodeURIComponent(query)}` : ""}`,
  ).catch(() => []);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Clientes"
        description="Cadastro, histórico de atendimentos e fichas de cada cliente."
        action={
          <Button href="/dashboard/clientes/novo" className="px-5 py-2.5 text-sm">
            <Plus size={16} weight="bold" />
            Novo cliente
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Lado Esquerdo */}
        <div className="flex flex-col gap-6 lg:col-span-5 xl:col-span-4">
          <HowItWorks>
            <p>
              Este é o <strong>cadastro de clientes do seu negócio</strong>: contato, histórico de
              atendimentos, observações, tags e fichas de anamnese.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Clientes entram aqui quando você cadastra ou quando fazem o primeiro agendamento pela sua página.</li>
              <li>Clique num cliente para ver e editar a ficha dele, e preencher as fichas de anamnese.</li>
              <li>Use as <strong>tags</strong> para agrupar (ex.: “VIP”, “alérgica a amônia”) e a busca por nome ou telefone para achar rápido.</li>
              <li>O mesmo telefone pode ter conta em vários negócios, mas cada negócio tem a própria ficha e não vê a dos outros.</li>
            </ul>
          </HowItWorks>

          <form className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 dark:border-white/15">
            <MagnifyingGlass size={16} className="text-zinc-400" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Buscar por nome ou telefone"
              className="w-full bg-transparent text-sm text-zinc-900 outline-none dark:text-white"
            />
          </form>
        </div>

        {/* Lado Direito */}
        <div className="flex min-w-0 flex-col lg:col-span-7 xl:col-span-8">
          {clients.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={IdentificationCard}
                title={query ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
                description={
                  query
                    ? "Tente buscar por outro nome ou telefone."
                    : "Clientes aparecem aqui assim que forem cadastrados ou fizerem o primeiro agendamento."
                }
                action={
                  !query ? (
                    <Button href="/dashboard/clientes/novo" className="mt-1 px-5 py-2.5 text-sm">
                      <Plus size={16} weight="bold" />
                      Novo cliente
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
              {clients.map((client, i) => (
                <li key={client.id} style={riseIn(i)} className="animate-rise-in">
                  <Link
                    href={`/dashboard/clientes/${client.id}`}
                    className="hover-nudge -mx-3 flex items-center justify-between gap-4 rounded-lg px-3 py-3.5 hover:bg-zinc-900/5 dark:hover:bg-white/5"
                  >
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">{client.name}</p>
                      <p className="text-sm text-zinc-500 dark:text-stone-400">
                        {client.phone}
                        {client.email ? ` · ${client.email}` : ""}
                      </p>
                      {client.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {client.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-zinc-400">
                      <p>
                        {client._count.appointments}{" "}
                        {client._count.appointments === 1 ? "atendimento" : "atendimentos"}
                      </p>
                      <p>desde {DateTime.fromISO(client.createdAt).setLocale("pt-BR").toFormat("LLL yyyy")}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

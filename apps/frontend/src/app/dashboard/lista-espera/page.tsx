import Link from "next/link";
import clsx from "clsx";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { WaitlistCounts, WaitlistEntryAdmin } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { requireArea } from "@/lib/access-server";
import { canAccess } from "@/lib/access";
import { parseWaitlistTab, WAITLIST_TABS, waitlistMessage } from "@/lib/waitlist";
import { WaitlistRow } from "./WaitlistRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";

const EMPTY_TEXT = {
  PENDING: "Ninguém aguardando agora.",
  CONTACTED: "Ninguém contatado esperando resposta.",
  CLOSED: "Nenhuma solicitação encerrada ainda.",
} as const;

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const access = await requireArea("lista_espera");
  const canEdit = canAccess(access, "lista_espera", "EDIT");
  const tab = parseWaitlistTab((await searchParams).aba);

  const [entries, counts, tenant] = await Promise.all([
    authedFetch<WaitlistEntryAdmin[]>(`/waitlist?status=${tab.status}`).catch(() => null),
    authedFetch<WaitlistCounts>("/waitlist/counts").catch(() => null),
    authedFetch<{ name: string }>("/tenants/me").catch(() => null),
  ]);

  const countOf = (value: string) =>
    !counts ? null : value === "aguardando" ? counts.pending : value === "contatados" ? counts.contacted : counts.closed;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Lista de espera"
        description="Clientes aguardando um horário livre. Chame no WhatsApp quando abrir uma vaga."
      />

      <div className="mt-6 flex flex-col gap-8">
        <HowItWorks>
          <p>
            Quando o horário que o cliente quer está cheio, ele entra na lista de espera pela sua página pública.
            Aqui você vê quem está esperando, para qual serviço, profissional e dia.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>O sistema <strong>não avisa o cliente sozinho</strong>: quando abrir uma vaga, use o botão do <strong>WhatsApp</strong> (a mensagem já vem escrita).</li>
            <li><strong>Marcar como contatado</strong> só registra que você já falou; ele fica na aba <em>Contatados</em> até você resolver.</li>
            <li><strong>Resolver</strong> quando ele foi atendido; <strong>Cancelar</strong> quando desistiu. As duas vão para <em>Encerrados</em> e não voltam.</li>
          </ul>
        </HowItWorks>

        <div className="flex min-w-0 flex-col">
          <nav aria-label="Filtros da lista de espera" className="flex gap-1 border-b border-zinc-200 dark:border-white/10">
            {WAITLIST_TABS.map((t) => {
              const active = t.value === tab.value;
              const count = countOf(t.value);
              return (
                <Link
                  key={t.value}
                  href={`/dashboard/lista-espera?aba=${t.value}`}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                    active
                      ? "border-accent-500 text-accent-700 dark:text-accent-300"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-stone-400 dark:hover:text-stone-200",
                  )}
                >
                  {t.label}
                  {count !== null ? <span className="ml-1.5 text-xs text-zinc-400">{count}</span> : null}
                </Link>
              );
            })}
          </nav>

          {entries === null ? (
            <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar a lista agora. Tente novamente em instantes.
            </p>
          ) : entries.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={ClockCounterClockwise} title={EMPTY_TEXT[tab.status]} description="Clientes aguardando horário aparecem aqui assim que entrarem pela sua página pública." />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
              {entries.map((entry, i) => (
                <WaitlistRow
                  key={entry.id}
                  entry={entry}
                  canEdit={canEdit}
                  index={i}
                  message={waitlistMessage({
                    clientName: entry.clientName,
                    serviceName: entry.serviceName,
                    tenantName: tenant?.name,
                    preferredDate: entry.preferredDate,
                  })}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

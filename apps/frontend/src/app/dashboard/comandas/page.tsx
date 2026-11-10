import Link from "next/link";
import clsx from "clsx";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Paginated, Ticket } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { OpenTicketButton } from "./OpenTicketButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { riseIn } from "@/lib/stagger";
import { brl } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { Pagination } from "@/components/ui/Pagination";
import { TICKET_TABS, parseTicketTab } from "./tabs";

const PAGE_SIZE = 15;
const EMPTY_PAGE: Paginated<Ticket> = { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, pageCount: 1 };

export default async function ComandasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; pagina?: string }>;
}) {
  const session = await auth();
  requireRole(session, ["OWNER", "RECEPTIONIST"]);

  const sp = await searchParams;
  const tab = parseTicketTab(sp.aba);
  const page = parsePageParam(sp.pagina);

  // Abertas: lista simples, como sempre. Fechadas e canceladas: o histórico, paginado (uma comanda fechada não some).
  let tickets: Ticket[];
  let paginated: Paginated<Ticket> | null = null;
  if (tab.status === "OPEN") {
    tickets = await authedFetch<Ticket[]>("/tickets").catch(() => []);
  } else {
    paginated = await authedFetch<Paginated<Ticket>>(`/tickets?status=${tab.status}&page=${page}&pageSize=${PAGE_SIZE}`).catch(() => EMPTY_PAGE);
    tickets = paginated.items;
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Comandas"
        description="A conta de um atendimento — itens, desconto e pagamento até fechar."
        action={<OpenTicketButton />}
      />

      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <HowItWorks>
            <p>
              A <strong>comanda</strong> é a conta de um atendimento, como a ficha de consumo do
              salão. Abra uma quando o cliente chegar (escolhendo o cliente, se já for cadastrado) ou a partir de um agendamento.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Adicione os <strong>serviços</strong> feitos e os <strong>produtos</strong> vendidos. O preço vem do catálogo e não pode ser alterado aqui.</li>
              <li>Se quiser, aplique um <strong>desconto</strong> (nunca maior que o subtotal).</li>
              <li>Registre o <strong>pagamento</strong>. Pode dividir em mais de uma forma (Pix + dinheiro, por exemplo).</li>
              <li><strong>Feche</strong> a comanda quando o valor estiver pago.</li>
            </ol>
            <p>
              Ao fechar, o sistema lança a receita no Financeiro, calcula a comissão do
              profissional e baixa o estoque dos produtos. A comanda fechada <strong>continua guardada</strong> na aba
              Fechadas (só o dono consegue reabri-la, com motivo, para corrigir). Na lista de abertas,{" "}
              <span className="text-amber-600 dark:text-amber-400">&quot;falta R$&quot;</span> é o quanto ainda não foi pago.
            </p>
          </HowItWorks>
        </div>

        <div className="flex min-w-0 flex-col">
          <nav aria-label="Filtrar comandas" className="mb-4 flex flex-wrap gap-1.5">
            {TICKET_TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "abertas" ? "/dashboard/comandas" : `/dashboard/comandas?aba=${t.key}`}
                aria-current={t.key === tab.key ? "page" : undefined}
                className={clsx(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  t.key === tab.key
                    ? "bg-accent-500 text-white"
                    : "text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/15 dark:hover:bg-white/10",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {tickets.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={tab.status === "OPEN" ? "Nenhuma comanda aberta" : tab.status === "CLOSED" ? "Nenhuma comanda fechada ainda" : "Nenhuma comanda cancelada"}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
              {tickets.map((ticket, i) => (
                <li
                  key={ticket.id}
                  style={riseIn(i)}
                  className="animate-rise-in"
                >
                  <Link
                    href={`/dashboard/comandas/${ticket.id}`}
                    className="hover-nudge -mx-3 flex items-center justify-between gap-4 rounded-lg px-3 py-3.5 hover:bg-zinc-900/5 dark:hover:bg-white/5"
                  >
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">
                        {ticket.client?.name ?? "Sem cliente"}
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-stone-400">
                        {ticket.items.length} {ticket.items.length === 1 ? "item" : "itens"} ·{" "}
                        {ticket.status === "CLOSED" && ticket.closedAt
                          ? `fechada em ${formatDateTime(ticket.closedAt)}`
                          : ticket.status === "CANCELED" && ticket.canceledAt
                            ? `cancelada em ${formatDateTime(ticket.canceledAt)}`
                            : `aberta em ${formatDateTime(ticket.openedAt)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {brl(ticket.totalCents)}
                      </p>
                      {ticket.status === "CANCELED" ? (
                        <p className="text-xs text-zinc-400">cancelada</p>
                      ) : ticket.dueCents > 0 ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          falta {brl(ticket.dueCents)}
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">pago</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {paginated ? (
            <Pagination page={paginated.page} pageCount={paginated.pageCount} pathname="/dashboard/comandas" searchParams={sp} paramName="pagina" className="mt-4" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

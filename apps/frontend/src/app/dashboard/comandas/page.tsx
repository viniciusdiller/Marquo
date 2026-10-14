import Link from "next/link";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Ticket } from "@marquo/shared-types";
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

export default async function ComandasPage() {
  const session = await auth();
  requireRole(session, ["OWNER", "RECEPTIONIST"]);

  const tickets = await authedFetch<Ticket[]>("/tickets").catch(() => []);

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
              profissional e baixa o estoque dos produtos. Depois de fechada, a comanda não
              muda mais. Na lista, <span className="text-amber-600 dark:text-amber-400">&quot;falta R$&quot;</span>{" "}
              é o quanto ainda não foi pago.
            </p>
          </HowItWorks>
        </div>

        <div className="flex min-w-0 flex-col">
          {tickets.length === 0 ? (
            <EmptyState icon={Receipt} title="Nenhuma comanda aberta" />
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
                        {ticket.items.length} {ticket.items.length === 1 ? "item" : "itens"} · aberta em{" "}
                        {formatDateTime(ticket.openedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {brl(ticket.totalCents)}
                      </p>
                      {ticket.dueCents > 0 ? (
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
        </div>
      </div>
    </div>
  );
}

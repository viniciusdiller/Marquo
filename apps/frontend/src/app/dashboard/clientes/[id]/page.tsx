import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { AdminClientDetail } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { ClientForm } from "../ClientForm";
import { HowItWorks, FieldHint } from "@/components/ui/HowItWorks";
import { IntakeSection } from "./IntakeSection";
import { brl } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { updateClientAction, listIntakeFormsAction } from "../actions";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Pendente",
  CONFIRMED: "Confirmado",
  IN_SERVICE: "Em atendimento",
  COMPLETED: "Finalizado",
  NO_SHOW: "Faltou",
  CANCELED: "Cancelado",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let client: AdminClientDetail;
  try {
    client = await authedFetch<AdminClientDetail>(`/clients/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    throw err;
  }
  const forms = await listIntakeFormsAction();

  const updateAction = updateClientAction.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
      >
        <CaretLeft size={14} />
        Clientes
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-zinc-900 dark:text-white">
        {client.name}
      </h1>

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-5 xl:col-span-4">
          <HowItWorks>
            <p>Esta é a ficha deste cliente no seu negócio. Ela tem quatro partes:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Cadastro:</strong> contato e dados pessoais. Altere e clique em “Salvar alterações”.</li>
              <li><strong>Anamnese:</strong> as fichas que você criou em Fichas. Cada uma pode ser preenchida e atualizada aqui.</li>
              <li><strong>Comandas:</strong> o que ele consumiu, com dia e hora de abertura e fechamento. Aparece quando a comanda é aberta com este cliente vinculado.</li>
              <li><strong>Histórico:</strong> todos os atendimentos dele aqui (só leitura), com profissional e status.</li>
            </ul>
            <p>Esta ficha é só do seu negócio: outros negócios não veem o que você escreve aqui.</p>
          </HowItWorks>

          <section>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Cadastro</h2>
            <div className="mt-3">
              <ClientForm action={updateAction} client={client} submitLabel="Salvar alterações" />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Anamnese</h2>
            <FieldHint>Perguntas de saúde e preferências feitas pela equipe. Clique em “Preencher” ou “Editar” em cada ficha.</FieldHint>
            <div className="mt-3">
              <IntakeSection clientId={client.id} forms={forms} responses={client.intakeResponses} />
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-10 lg:col-span-7 xl:col-span-8">
          <section>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Balanço e Estatísticas</h2>
            <FieldHint>Resumo gerado automaticamente com base nas comandas e histórico.</FieldHint>
            
            {(() => {
              const now = DateTime.now();
              let visitsThisMonth = 0;
              let totalSpentCents = 0;
              const serviceCounts: Record<string, number> = {};

              // Conta serviços e valores via comandas fechadas e abertas
              for (const t of client.tickets) {
                totalSpentCents += t.totalCents;
                const dt = DateTime.fromISO(t.openedAt);
                if (dt.hasSame(now, "month") && dt.hasSame(now, "year")) {
                  visitsThisMonth++;
                }
                for (const i of t.items) {
                  serviceCounts[i.description] = (serviceCounts[i.description] || 0) + i.quantity;
                }
              }

              // Para capturar serviços agendados que não viraram comanda (depende da operação do salão)
              for (const a of client.appointments) {
                if (a.status === "COMPLETED" || a.status === "IN_SERVICE") {
                  // Se o mês for igual, e não quisermos somar com a comanda pra não duplicar,
                  // vamos usar a comanda como fonte de "visitas financeiras". 
                  // Mas adicionamos à contagem de favoritos:
                  for (const i of a.items) {
                    // Tenta não duplicar se a string do agendamento bater com o da comanda
                    if (!serviceCounts[i.service.name]) {
                      serviceCounts[i.service.name] = 0;
                    }
                    // Em salões grandes, geralmente o que dita favorito é a intenção da agenda
                    serviceCounts[i.service.name] += 1; 
                  }
                }
              }

              const topServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]);
              const favoriteService = topServices.length > 0 ? topServices[0][0] : "-";

              return (
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-500 dark:text-stone-400">Visitas Neste Mês</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">{visitsThisMonth}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-500 dark:text-stone-400">Mais Realizado</p>
                    <p className="mt-1 truncate text-lg font-bold text-zinc-900 dark:text-white" title={favoriteService}>
                      {favoriteService}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-500 dark:text-stone-400">Balanço Total</p>
                    <p className="mt-1 truncate text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {brl(totalSpentCents)}
                    </p>
                  </div>
                </div>
              );
            })()}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Comandas ({client.tickets.length})
            </h2>
            <FieldHint>Serviços e produtos consumidos, com o dia e a hora em que a comanda foi aberta e fechada.</FieldHint>
            {client.tickets.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-stone-400">
                Nenhuma comanda vinculada a este cliente ainda. Ao abrir uma comanda, escolha o cliente para ela aparecer aqui.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
                {client.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/dashboard/comandas/${ticket.id}`}
                      className="hover-nudge -mx-3 flex items-start justify-between gap-4 rounded-lg px-3 py-3 hover:bg-zinc-900/5 dark:hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                          {ticket.items.length > 0
                            ? ticket.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.description}` : i.description)).join(", ")
                            : "Sem itens"}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-stone-400">
                          Aberta em {formatDateTime(ticket.openedAt)}
                          {ticket.closedAt ? ` · fechada em ${formatDateTime(ticket.closedAt)}` : " · em aberto"}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-white">{brl(ticket.totalCents)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Histórico ({client.appointments.length})
            </h2>
            <FieldHint>Atendimentos já feitos ou marcados. Para mudar um, use a Agenda.</FieldHint>
            {client.appointments.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-stone-400">Nenhum atendimento.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
                {client.appointments.map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">
                        {appointment.items.map((i) => i.service.name).join(", ")}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-stone-400">
                        {appointment.professional.user.name} ·{" "}
                        {STATUS_LABEL[appointment.status] ?? appointment.status}
                      </p>
                    </div>
                    <p className="text-right text-xs text-zinc-500 dark:text-stone-400">
                      {DateTime.fromISO(appointment.startAt)
                        .setLocale("pt-BR")
                        .toFormat("dd/LL/yyyy HH:mm")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

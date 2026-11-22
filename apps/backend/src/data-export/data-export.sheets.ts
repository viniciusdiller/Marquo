import type { PrismaService } from "../prisma/prisma.service";
import type { Column, SheetSpec } from "./xlsx-writer";

// Abas da planilha de exportação (mesmo conteúdo do JSON, legível para quem abre no Excel/Google Planilhas): nomes em vez
// de ids, valores em reais, datas no fuso do negócio e situações traduzidas. Tudo filtrado pelo tenantId do JWT e com
// `select` explícito (nada de hash de senha, token ou dado de cobrança).

const APPOINTMENT_STATUS: Record<string, string> = {
  SCHEDULED: "Agendado", CONFIRMED: "Confirmado", IN_SERVICE: "Em atendimento", COMPLETED: "Concluído", NO_SHOW: "Não compareceu", CANCELED: "Cancelado",
};
const SOURCE: Record<string, string> = { PUBLIC: "Link público", STAFF: "Equipe" };
const WAITLIST_STATUS: Record<string, string> = { PENDING: "Aguardando", CONTACTED: "Contatado", RESOLVED: "Resolvido", CANCELED: "Cancelado" };
const TICKET_STATUS: Record<string, string> = { OPEN: "Aberta", CLOSED: "Fechada", CANCELED: "Cancelada" };
const ITEM_KIND: Record<string, string> = { SERVICE: "Serviço", PRODUCT: "Produto", CUSTOM: "Avulso" };
const PAYMENT: Record<string, string> = { CASH: "Dinheiro", DEBIT: "Débito", CREDIT: "Crédito", PIX: "Pix", OTHER: "Outro" };
const STOCK_KIND: Record<string, string> = { IN: "Entrada", OUT: "Saída", ADJUSTMENT: "Ajuste", SALE: "Venda" };
const DIRECTION: Record<string, string> = { INCOME: "Receita", EXPENSE: "Despesa" };
const ENTRY_STATUS: Record<string, string> = { PENDING: "Pendente", PAID: "Pago", CANCELED: "Cancelado" };
const ENTRY_SOURCE: Record<string, string> = { TICKET: "Comanda", COMMISSION: "Comissão", MANUAL: "Manual" };
const ROLE: Record<string, string> = { OWNER: "Dono", RECEPTIONIST: "Recepção", PROFESSIONAL: "Profissional" };
const REVIEW_STATUS: Record<string, string> = { VISIBLE: "Visível", HIDDEN: "Oculta", PENDING_REPORT: "Denunciada" };

const tr = (map: Record<string, string>, value: string | null | undefined) => (value ? (map[value] ?? value) : null);
// Código curto para cruzar comanda, itens e pagamentos entre as abas.
const code = (id: string) => id.slice(0, 8);

// Lotes com paginação estável por id (cursor) e o filtro de dono SEMPRE no where.
function paged<R extends { id: string }>(fetch: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<R[]>, batchSize: number) {
  return async function* (): AsyncGenerator<R[]> {
    let cursor: string | undefined;
    for (;;) {
      const rows = await fetch({ take: batchSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (rows.length) yield rows;
      if (rows.length < batchSize) return;
      cursor = rows[rows.length - 1].id;
    }
  };
}

function sheet<R>(name: string, columns: Column<R>[], batches: () => AsyncIterable<R[]>): SheetSpec<R> {
  return { name, columns, batches };
}

type Tenant = {
  name: string; slug: string; description: string | null; address: string | null; businessHours: string | null;
  whatsappNumber: string | null; instagramUrl: string | null; city: string | null; neighborhood: string | null; createdAt: Date;
};

export function buildExportSheets(prisma: PrismaService, tenantId: string, tenant: Tenant, batchSize: number): SheetSpec<any>[] {
  const p = prisma;
  const base = { where: { tenantId }, orderBy: { id: "asc" as const } };
  const ticketSelect = {
    id: true, status: true, openedAt: true, closedAt: true, canceledAt: true, discountCents: true, clubCoveredCents: true, note: true,
    client: { select: { name: true, phone: true } },
    items: {
      orderBy: { createdAt: "asc" as const },
      select: { kind: true, description: true, quantity: true, unitPriceCents: true, createdAt: true, professional: { select: { user: { select: { name: true } } } } },
    },
    payments: { orderBy: { createdAt: "asc" as const }, select: { method: true, amountCents: true, createdAt: true } },
  };
  const tickets = paged((page) => p.ticket.findMany({ ...base, ...page, select: ticketSelect }), batchSize);
  type TicketRow = Awaited<ReturnType<typeof p.ticket.findMany<{ select: typeof ticketSelect }>>>[number];
  const subtotal = (t: TicketRow) => t.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  // Itens e pagamentos ganham abas próprias: lê as comandas de novo e "achata" cada lote.
  const flat = <T>(pick: (t: TicketRow) => T[]) =>
    async function* () {
      for await (const batch of tickets()) yield batch.flatMap(pick);
    };

  return [
    sheet<[string, string | null]>(
      "Negócio",
      [
        { header: "Campo", type: "text", width: 22, value: (r) => r[0] },
        { header: "Valor", type: "text", width: 60, value: (r) => r[1] },
      ],
      async function* () {
        yield [
          ["Nome", tenant.name], ["Endereço na web", tenant.slug], ["Descrição", tenant.description], ["Endereço", tenant.address],
          ["Bairro", tenant.neighborhood], ["Cidade", tenant.city], ["Horário de funcionamento", tenant.businessHours],
          ["WhatsApp", tenant.whatsappNumber], ["Instagram", tenant.instagramUrl],
          ["Cliente Marquo desde", tenant.createdAt.toISOString().slice(0, 10)], ["Planilha gerada em", new Date().toISOString()],
        ];
      },
    ),
    sheet(
      "Profissionais",
      [
        { header: "Nome", type: "text", value: (r) => r.user.name },
        { header: "E-mail", type: "text", width: 30, value: (r) => r.user.email },
        { header: "Telefone", type: "text", width: 16, value: (r) => r.user.phone },
        { header: "Papel", type: "text", width: 14, value: (r) => tr(ROLE, r.user.role) },
        { header: "Ativo", type: "text", width: 8, value: (r) => r.isActive && r.user.isActive },
        { header: "Bio", type: "text", width: 40, value: (r) => r.bio },
        { header: "Cadastrado em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.professional.findMany({
        ...base, ...page,
        select: { id: true, bio: true, isActive: true, createdAt: true, user: { select: { name: true, email: true, phone: true, role: true, isActive: true } } },
      }), batchSize),
    ),
    sheet(
      "Serviços",
      [
        { header: "Nome", type: "text", value: (r) => r.name },
        { header: "Descrição", type: "text", width: 40, value: (r) => r.description },
        { header: "Duração (min)", type: "number", width: 13, value: (r) => r.durationMinutes },
        { header: "Preço", type: "money", value: (r) => r.priceCents },
        { header: "Ativo", type: "text", width: 8, value: (r) => r.isActive },
        { header: "Cadastrado em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.service.findMany({
        ...base, ...page,
        select: { id: true, name: true, description: true, durationMinutes: true, priceCents: true, isActive: true, createdAt: true },
      }), batchSize),
    ),
    sheet(
      "Clientes",
      [
        { header: "Nome", type: "text", value: (r) => r.name },
        { header: "Telefone", type: "text", width: 16, value: (r) => r.phone },
        { header: "E-mail", type: "text", width: 30, value: (r) => r.email },
        { header: "Nascimento", type: "date", value: (r) => r.birthDate },
        { header: "CPF", type: "text", width: 15, value: (r) => r.cpf },
        { header: "Etiquetas", type: "text", value: (r) => r.tags.join(", ") },
        { header: "Observações", type: "text", width: 40, value: (r) => r.notes },
        { header: "Cadastrado em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.client.findMany({
        ...base, ...page,
        select: { id: true, name: true, phone: true, email: true, birthDate: true, cpf: true, notes: true, tags: true, createdAt: true },
      }), batchSize),
    ),
    sheet(
      "Agendamentos",
      [
        { header: "Início", type: "datetime", value: (r) => r.startAt },
        { header: "Fim", type: "datetime", value: (r) => r.endAt },
        { header: "Cliente", type: "text", value: (r) => r.clientName },
        { header: "Telefone", type: "text", width: 16, value: (r) => r.clientPhone },
        { header: "Profissional", type: "text", value: (r) => r.professional.user.name },
        { header: "Serviços", type: "text", width: 34, value: (r) => r.items.map((i: { service: { name: string } }) => i.service.name).join(", ") },
        { header: "Valor", type: "money", value: (r) => r.items.reduce((s: number, i: { priceCentsSnapshot: number }) => s + i.priceCentsSnapshot, 0) },
        { header: "Situação", type: "text", width: 16, value: (r) => tr(APPOINTMENT_STATUS, r.status) },
        { header: "Origem", type: "text", width: 13, value: (r) => tr(SOURCE, r.source) },
        { header: "Observações", type: "text", width: 34, value: (r) => r.notes },
        { header: "Criado em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.appointment.findMany({
        ...base, ...page,
        select: {
          id: true, clientName: true, clientPhone: true, startAt: true, endAt: true, status: true, source: true, notes: true, createdAt: true,
          professional: { select: { user: { select: { name: true } } } },
          items: { orderBy: { position: "asc" }, select: { priceCentsSnapshot: true, service: { select: { name: true } } } },
        },
      }), batchSize),
    ),
    sheet(
      "Lista de espera",
      [
        { header: "Cliente", type: "text", value: (r) => r.clientName },
        { header: "Telefone", type: "text", width: 16, value: (r) => r.clientPhone },
        { header: "Serviço", type: "text", value: (r) => r.service?.name },
        { header: "Profissional", type: "text", value: (r) => r.professional?.user.name ?? "Qualquer um" },
        { header: "Data preferida", type: "date", width: 14, value: (r) => r.preferredDate },
        { header: "Situação", type: "text", width: 13, value: (r) => tr(WAITLIST_STATUS, r.status) },
        { header: "Observações", type: "text", width: 34, value: (r) => r.notes },
        { header: "Criado em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.waitlistEntry.findMany({
        ...base, ...page,
        select: {
          id: true, clientName: true, clientPhone: true, preferredDate: true, notes: true, status: true, createdAt: true,
          service: { select: { name: true } }, professional: { select: { user: { select: { name: true } } } },
        },
      }), batchSize),
    ),
    sheet(
      "Fichas preenchidas",
      [
        { header: "Ficha", type: "text", value: (r) => r.form.name },
        { header: "Cliente", type: "text", value: (r) => r.client?.name },
        { header: "Respostas", type: "text", width: 80, value: (r) => formatAnswers(r.form.fields, r.answers) },
        { header: "Preenchida em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.intakeResponse.findMany({
        ...base, ...page,
        select: { id: true, answers: true, createdAt: true, form: { select: { name: true, fields: true } }, client: { select: { name: true } } },
      }), batchSize),
    ),
    sheet(
      "Produtos",
      [
        { header: "Nome", type: "text", value: (r) => r.name },
        { header: "SKU", type: "text", width: 14, value: (r) => r.sku },
        { header: "Preço", type: "money", value: (r) => r.priceCents },
        { header: "Custo", type: "money", value: (r) => r.costCents },
        { header: "Ativo", type: "text", width: 8, value: (r) => r.isActive },
        { header: "Cadastrado em", type: "datetime", value: (r) => r.createdAt },
      ],
      paged((page) => p.product.findMany({
        ...base, ...page,
        select: { id: true, name: true, sku: true, priceCents: true, costCents: true, isActive: true, createdAt: true },
      }), batchSize),
    ),
    sheet(
      "Estoque",
      [
        { header: "Data", type: "datetime", value: (r) => r.createdAt },
        { header: "Produto", type: "text", value: (r) => r.product.name },
        { header: "Tipo", type: "text", width: 10, value: (r) => tr(STOCK_KIND, r.kind) },
        { header: "Quantidade", type: "number", value: (r) => r.quantity },
        { header: "Observação", type: "text", width: 34, value: (r) => r.note },
      ],
      paged((page) => p.stockMovement.findMany({
        ...base, ...page,
        select: { id: true, kind: true, quantity: true, note: true, createdAt: true, product: { select: { name: true } } },
      }), batchSize),
    ),
    sheet<TicketRow>(
      "Comandas",
      [
        { header: "Comanda", type: "text", width: 10, value: (t) => code(t.id) },
        { header: "Aberta em", type: "datetime", value: (t) => t.openedAt },
        { header: "Fechada em", type: "datetime", value: (t) => t.closedAt },
        { header: "Situação", type: "text", width: 10, value: (t) => tr(TICKET_STATUS, t.status) },
        { header: "Cliente", type: "text", value: (t) => t.client?.name },
        { header: "Subtotal", type: "money", value: (t) => subtotal(t) },
        { header: "Desconto", type: "money", value: (t) => t.discountCents },
        { header: "Coberto pelo clube", type: "money", width: 17, value: (t) => t.clubCoveredCents },
        { header: "Total", type: "money", value: (t) => Math.max(0, subtotal(t) - t.discountCents - t.clubCoveredCents) },
        { header: "Pago", type: "money", value: (t) => t.payments.reduce((s, pay) => s + pay.amountCents, 0) },
        { header: "Observação", type: "text", width: 30, value: (t) => t.note },
      ],
      tickets,
    ),
    sheet<{ ticket: TicketRow; item: TicketRow["items"][number] }>(
      "Itens das comandas",
      [
        { header: "Comanda", type: "text", width: 10, value: (r) => code(r.ticket.id) },
        { header: "Data", type: "datetime", value: (r) => r.item.createdAt },
        { header: "Tipo", type: "text", width: 10, value: (r) => tr(ITEM_KIND, r.item.kind) },
        { header: "Descrição", type: "text", width: 30, value: (r) => r.item.description },
        { header: "Profissional", type: "text", value: (r) => r.item.professional?.user.name },
        { header: "Quantidade", type: "number", value: (r) => r.item.quantity },
        { header: "Preço unitário", type: "money", value: (r) => r.item.unitPriceCents },
        { header: "Total", type: "money", value: (r) => r.item.unitPriceCents * r.item.quantity },
      ],
      flat((ticket) => ticket.items.map((item) => ({ ticket, item }))),
    ),
    sheet<{ ticket: TicketRow; payment: TicketRow["payments"][number] }>(
      "Pagamentos",
      [
        { header: "Comanda", type: "text", width: 10, value: (r) => code(r.ticket.id) },
        { header: "Data", type: "datetime", value: (r) => r.payment.createdAt },
        { header: "Forma", type: "text", width: 12, value: (r) => tr(PAYMENT, r.payment.method) },
        { header: "Valor", type: "money", value: (r) => r.payment.amountCents },
      ],
      flat((ticket) => ticket.payments.map((payment) => ({ ticket, payment }))),
    ),
    sheet(
      "Financeiro",
      [
        { header: "Tipo", type: "text", width: 10, value: (r) => tr(DIRECTION, r.direction) },
        { header: "Situação", type: "text", width: 11, value: (r) => tr(ENTRY_STATUS, r.status) },
        { header: "Origem", type: "text", width: 11, value: (r) => tr(ENTRY_SOURCE, r.source) },
        { header: "Descrição", type: "text", width: 34, value: (r) => r.description },
        { header: "Categoria", type: "text", value: (r) => r.category?.name },
        { header: "Contraparte", type: "text", value: (r) => r.counterparty },
        { header: "Valor", type: "money", value: (r) => r.amountCents },
        { header: "Vencimento", type: "date", value: (r) => r.dueDate },
        { header: "Pago em", type: "datetime", value: (r) => r.paidAt },
        { header: "Forma", type: "text", width: 11, value: (r) => tr(PAYMENT, r.paymentMethod) },
        { header: "Observações", type: "text", width: 30, value: (r) => r.notes },
      ],
      paged((page) => p.financialEntry.findMany({
        ...base, ...page,
        select: {
          id: true, direction: true, status: true, source: true, description: true, amountCents: true, counterparty: true,
          dueDate: true, paidAt: true, paymentMethod: true, notes: true, category: { select: { name: true } },
        },
      }), batchSize),
    ),
    sheet(
      "Repasses de comissão",
      [
        { header: "Data", type: "datetime", value: (r) => r.createdAt },
        { header: "Profissional", type: "text", value: (r) => r.professional.user.name },
        { header: "Valor", type: "money", value: (r) => r.amountCents },
        { header: "Observação", type: "text", width: 34, value: (r) => r.note },
      ],
      paged((page) => p.commissionPayout.findMany({
        ...base, ...page,
        select: { id: true, amountCents: true, note: true, createdAt: true, professional: { select: { user: { select: { name: true } } } } },
      }), batchSize),
    ),
    sheet(
      "Avaliações",
      [
        { header: "Data", type: "datetime", value: (r) => r.createdAt },
        { header: "Nota", type: "number", width: 7, value: (r) => r.rating },
        { header: "Comentário", type: "text", width: 50, value: (r) => r.comment },
        { header: "Situação", type: "text", width: 12, value: (r) => tr(REVIEW_STATUS, r.status) },
      ],
      // Sem a identidade de quem avaliou: a conta de cliente é do cliente, não do negócio.
      paged((page) => p.review.findMany({
        ...base, ...page,
        select: { id: true, rating: true, comment: true, status: true, createdAt: true },
      }), batchSize),
    ),
  ];
}

// "Pergunta: resposta | Pergunta: resposta", com o rótulo do campo no lugar da chave interna.
export function formatAnswers(fields: unknown, answers: unknown): string {
  const labels = new Map<string, string>();
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (f && typeof f === "object" && "key" in f && "label" in f) labels.set(String(f.key), String(f.label));
    }
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return "";
  return Object.entries(answers as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${labels.get(k) ?? k}: ${typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v)}`)
    .join(" | ");
}

import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";

export const EXPORT_BATCH_SIZE = 500;

interface Section {
  name: string;
  // Busca o próximo lote depois do cursor (id do último registro já exportado). Sempre com tenantId no WHERE.
  fetch: (cursor: string | undefined, take: number) => Promise<{ id: string }[]>;
}

// Cópia completa dos dados do negócio, em JSON, para o DONO levar consigo (portabilidade, LGPD art. 18).
//
// - Escopo: tudo sai filtrado pelo tenantId do JWT (nunca do request), e o `select` de cada tabela é explícito: nenhum
//   hash de senha, token de definição de senha, refresh token ou dado de cobrança entra aqui.
// - Memória: o arquivo é montado em streaming, em lotes de 500 por tabela com cursor por id, então um negócio grande
//   não carrega tudo de uma vez nem vira um JSON gigante na memória.
// - Uma exportação por negócio por vez (neste processo): o mesmo dono apertando o botão várias vezes não multiplica a
//   carga no banco.
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);
  private readonly inProgress = new Set<string>();
  // Ajustável só em teste.
  batchSize = EXPORT_BATCH_SIZE;

  constructor(private readonly prisma: PrismaService) {}

  async start(tenantId: string): Promise<{ filename: string; stream: Readable }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        businessHours: true,
        whatsappNumber: true,
        instagramUrl: true,
        city: true,
        neighborhood: true,
        createdAt: true,
      },
    });
    if (!tenant) throw new NotFoundException("Negócio não encontrado.");

    if (this.inProgress.has(tenantId)) {
      throw new ConflictException("Já existe uma exportação em andamento. Aguarde terminar e tente de novo.");
    }
    this.inProgress.add(tenantId);

    const release = () => this.inProgress.delete(tenantId);
    const stream = Readable.from(this.generate(tenant, release), { objectMode: false });
    // Cliente que cancela o download destrói o stream: a trava precisa sair junto.
    stream.once("close", release);

    this.logger.log(`Exportação de dados iniciada (negócio ${tenantId}).`);
    const today = new Date().toISOString().slice(0, 10);
    const safeSlug = tenant.slug.replace(/[^a-z0-9-]/g, "");
    return { filename: `marquo-dados-${safeSlug || "negocio"}-${today}.json`, stream };
  }

  private async *generate(tenant: { id: string }, release: () => void): AsyncGenerator<string> {
    try {
      yield `{"formato":"marquo-export","versao":1,"geradoEm":${JSON.stringify(new Date().toISOString())},"negocio":${JSON.stringify(tenant)}`;
      for (const section of this.sections(tenant.id)) {
        yield `,${JSON.stringify(section.name)}:[`;
        let first = true;
        let cursor: string | undefined;
        for (;;) {
          const rows = await section.fetch(cursor, this.batchSize);
          for (const row of rows) {
            yield (first ? "" : ",") + JSON.stringify(row);
            first = false;
          }
          if (rows.length < this.batchSize) break;
          cursor = rows[rows.length - 1].id;
        }
        yield "]";
      }
      yield "}\n";
    } finally {
      release();
    }
  }

  private sections(tenantId: string): Section[] {
    const p = this.prisma;
    // `where` e `orderBy` iguais em todas: filtro de dono + paginação estável por id.
    const page = (cursor: string | undefined, take: number) => ({
      where: { tenantId },
      orderBy: { id: "asc" as const },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return [
      {
        name: "profissionais",
        fetch: (c, t) =>
          p.professional.findMany({
            ...page(c, t),
            select: {
              id: true,
              bio: true,
              isActive: true,
              createdAt: true,
              user: { select: { name: true, email: true, phone: true, role: true, isActive: true } },
            },
          }),
      },
      {
        name: "servicos",
        fetch: (c, t) =>
          p.service.findMany({
            ...page(c, t),
            select: { id: true, name: true, description: true, durationMinutes: true, priceCents: true, isActive: true, createdAt: true },
          }),
      },
      {
        name: "clientes",
        fetch: (c, t) =>
          p.client.findMany({
            ...page(c, t),
            select: { id: true, name: true, phone: true, email: true, birthDate: true, cpf: true, notes: true, tags: true, createdAt: true },
          }),
      },
      {
        name: "agendamentos",
        fetch: (c, t) =>
          p.appointment.findMany({
            ...page(c, t),
            select: {
              id: true,
              clientId: true,
              clientName: true,
              clientPhone: true,
              professionalId: true,
              startAt: true,
              endAt: true,
              status: true,
              source: true,
              notes: true,
              createdAt: true,
              items: {
                orderBy: { position: "asc" },
                select: { serviceId: true, durationMinutes: true, priceCentsSnapshot: true, service: { select: { name: true } } },
              },
            },
          }),
      },
      {
        name: "listaDeEspera",
        fetch: (c, t) =>
          p.waitlistEntry.findMany({
            ...page(c, t),
            select: { id: true, clientName: true, clientPhone: true, serviceId: true, professionalId: true, preferredDate: true, notes: true, status: true, createdAt: true },
          }),
      },
      {
        name: "fichasModelos",
        fetch: (c, t) =>
          p.intakeForm.findMany({
            ...page(c, t),
            select: { id: true, name: true, fields: true, isActive: true, createdAt: true },
          }),
      },
      {
        name: "fichasRespostas",
        fetch: (c, t) =>
          p.intakeResponse.findMany({
            ...page(c, t),
            select: { id: true, formId: true, clientId: true, appointmentId: true, answers: true, createdAt: true },
          }),
      },
      {
        name: "produtos",
        fetch: (c, t) =>
          p.product.findMany({
            ...page(c, t),
            select: { id: true, name: true, sku: true, priceCents: true, costCents: true, isActive: true, createdAt: true },
          }),
      },
      {
        name: "movimentosDeEstoque",
        fetch: (c, t) =>
          p.stockMovement.findMany({
            ...page(c, t),
            select: { id: true, productId: true, kind: true, quantity: true, note: true, createdAt: true },
          }),
      },
      {
        name: "comandas",
        fetch: (c, t) =>
          p.ticket.findMany({
            ...page(c, t),
            select: {
              id: true,
              clientId: true,
              appointmentId: true,
              status: true,
              discountCents: true,
              note: true,
              openedAt: true,
              closedAt: true,
              canceledAt: true,
              items: {
                select: { kind: true, description: true, quantity: true, unitPriceCents: true, serviceId: true, productId: true, professionalId: true, createdAt: true },
              },
              payments: { select: { method: true, amountCents: true, createdAt: true } },
            },
          }),
      },
      {
        name: "categoriasFinanceiras",
        fetch: (c, t) =>
          p.financialCategory.findMany({
            ...page(c, t),
            select: { id: true, name: true, direction: true, parentId: true, isArchived: true, createdAt: true },
          }),
      },
      {
        name: "financeiro",
        fetch: (c, t) =>
          p.financialEntry.findMany({
            ...page(c, t),
            select: {
              id: true,
              direction: true,
              status: true,
              source: true,
              description: true,
              amountCents: true,
              categoryId: true,
              counterparty: true,
              ticketId: true,
              dueDate: true,
              paidAt: true,
              paymentMethod: true,
              notes: true,
              createdAt: true,
            },
          }),
      },
      {
        name: "repassesDeComissao",
        fetch: (c, t) =>
          p.commissionPayout.findMany({
            ...page(c, t),
            select: { id: true, professionalId: true, amountCents: true, note: true, createdAt: true },
          }),
      },
      {
        name: "avaliacoes",
        // Sem a identidade de quem avaliou: a conta de cliente é do cliente, não do negócio.
        fetch: (c, t) =>
          p.review.findMany({
            ...page(c, t),
            select: { id: true, appointmentId: true, rating: true, comment: true, status: true, createdAt: true },
          }),
      },
    ];
  }
}

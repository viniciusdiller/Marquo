import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CashRegisterStatus, PaymentMethod, Prisma, TicketAuditAction, TicketItemKind, TicketStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { FinanceService } from "../finance/finance.service";
import { ClubService, type TicketCoverage } from "../club/club.service";
import {
  AddPaymentDto,
  AddTicketItemDto,
  OpenTicketDto,
  SetTicketClientDto,
  SetTicketDiscountDto,
  SetTicketNoteDto,
  TicketReasonDto,
  UpdateTicketItemDto,
} from "./dto/ticket-dtos";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";

const formatBrl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TICKET_INCLUDE = {
  items: {
    include: {
      professional: { include: { user: { select: { name: true } } } },
      // Quanto do item o clube cobriu (só existe em comanda FECHADA de membro).
      clubUsage: { select: { units: true, coveredCents: true } },
    },
  },
  payments: true,
  client: { select: { id: true, name: true, phone: true } },
  appointment: { select: { id: true, startAt: true } },
} satisfies Prisma.TicketInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly commissions: CommissionsService,
    private readonly cashRegister: CashRegisterService,
    private readonly finance: FinanceService,
    private readonly club: ClubService,
  ) {}

  async open(tenantId: string, userId: string, dto: OpenTicketDto) {
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, tenantId },
        include: { items: { include: { service: { select: { name: true } } } }, ticket: true },
      });
      if (!appointment) {
        throw new NotFoundException("Atendimento não encontrado.");
      }
      // Já tem comanda: devolve a existente (relida com o tenantId no WHERE) em vez de 409. "Abrir comanda" na agenda vira
      // "ir para a comanda" quando ela já foi aberta, e um duplo clique não cria nem quebra nada.
      if (appointment.ticket) {
        return this.get(tenantId, appointment.ticket.id);
      }

      return this.serialize(
        await this.prisma.ticket.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            clientId: appointment.clientId,
            openedByUserId: userId,
            note: dto.note?.trim() || null,
            items: {
              create: appointment.items.map((item) => ({
                kind: TicketItemKind.SERVICE,
                serviceId: item.serviceId,
                professionalId: appointment.professionalId,
                description: item.service.name,
                quantity: 1,
                unitPriceCents: item.priceCentsSnapshot,
              })),
            },
          },
          include: TICKET_INCLUDE,
        }),
      );
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId },
        select: { id: true },
      });
      if (!client) {
        throw new NotFoundException("Cliente não encontrado.");
      }
    }

    return this.serialize(
      await this.prisma.ticket.create({
        data: {
          tenantId,
          clientId: dto.clientId ?? null,
          openedByUserId: userId,
          note: dto.note?.trim() || null,
        },
        include: TICKET_INCLUDE,
      }),
    );
  }

  async findOpen(tenantId: string, paginationQuery?: PaginationQueryDto) {
    const hasPagination =
      paginationQuery?.page !== undefined || paginationQuery?.pageSize !== undefined;
    const pagination = resolvePagination(paginationQuery ?? {});

    const tickets = await this.prisma.ticket.findMany({
      where: { tenantId, status: TicketStatus.OPEN },
      include: TICKET_INCLUDE,
      orderBy: { openedAt: "asc" },
      take: hasPagination ? pagination.take : undefined,
      ...(hasPagination ? { skip: pagination.skip } : {}),
    });
    // O clube é conferido uma vez para a página inteira (não uma por comanda).
    const clubActive = await this.club.isActive(tenantId);
    return Promise.all(tickets.map((ticket) => this.serialize(ticket, { clubActive })));
  }

  // Histórico: comandas FECHADAS ou CANCELADAS, paginado, da mais recente para a mais antiga (fechamento/cancelamento). Uma comanda
  // fechada não pode "sumir": é o registro do atendimento. Só o próprio negócio (tenantId no WHERE).
  async findFinished(tenantId: string, status: "CLOSED" | "CANCELED", paginationQuery: PaginationQueryDto) {
    const pagination = resolvePagination(paginationQuery);
    const where: Prisma.TicketWhereInput = { tenantId, status: status === "CLOSED" ? TicketStatus.CLOSED : TicketStatus.CANCELED };
    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: TICKET_INCLUDE,
        // Desempate por id: duas comandas no mesmo instante não trocam de página entre uma consulta e outra.
        orderBy: [status === "CLOSED" ? { closedAt: "desc" } : { canceledAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    // Fechada/cancelada nunca recalcula o clube (usa o valor gravado), então não há consulta extra por comanda.
    const items = await Promise.all(tickets.map((ticket) => this.serialize(ticket, { clubActive: false })));
    return toPage(items, total, pagination);
  }

  async get(tenantId: string, id: string) {
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  async addItem(tenantId: string, id: string, dto: AddTicketItemDto) {
    const quantity = dto.quantity ?? 1;

    // Preço de item de catálogo nunca vem do cliente — só CUSTOM (sem catálogo pra
    // derivar) pode enviar unitPriceCents. Sem essa trava, um RECEPTIONIST mandava
    // unitPriceCents: 1 num serviço de R$150 e o valor sobrescrevia o catálogo,
    // corrompendo total da comanda, comissão (CommissionsService.computeForTicket) e
    // receita lançada no financeiro (FinanceService.recordTicketIncome) — sem nenhum
    // log de auditoria no projeto pra rastrear depois. Ver CLAUDE.md > Segurança >
    // Confiança no cliente.
    if (dto.kind !== "CUSTOM" && dto.unitPriceCents !== undefined) {
      throw new BadRequestException(
        "unitPriceCents não é aceito para SERVICE/PRODUCT — o preço vem sempre do catálogo.",
      );
    }

    await this.lockedOpenTicket(tenantId, id, async (tx, ticket) => {
      let data: Prisma.TicketItemCreateWithoutTicketInput;
      if (dto.kind === "SERVICE") {
        const service = await this.prisma.service.findFirst({
          where: { id: dto.serviceId, tenantId },
        });
        if (!service) throw new NotFoundException("Serviço não encontrado.");
        data = {
          kind: TicketItemKind.SERVICE,
          service: { connect: { id: service.id } },
          description: service.name,
          quantity,
          unitPriceCents: service.priceCents,
        };
      } else if (dto.kind === "PRODUCT") {
        const product = await this.products.getOrThrow(tenantId, dto.productId!);
        data = {
          kind: TicketItemKind.PRODUCT,
          product: { connect: { id: product.id } },
          description: product.name,
          quantity,
          unitPriceCents: product.priceCents,
        };
      } else {
        data = {
          kind: TicketItemKind.CUSTOM,
          description: dto.description!.trim(),
          quantity,
          unitPriceCents: dto.unitPriceCents!,
        };
      }

      if (dto.professionalId) {
        const professional = await this.prisma.professional.findFirst({
          where: { id: dto.professionalId, tenantId },
          select: { id: true },
        });
        if (!professional) throw new NotFoundException("Profissional não encontrado.");
        data.professional = { connect: { id: dto.professionalId } };
      }

      await tx.ticketItem.create({ data: { ...data, ticket: { connect: { id: ticket.id } } } });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  async removeItem(tenantId: string, id: string, itemId: string) {
    await this.lockedOpenTicket(tenantId, id, async (tx) => {
      const item = await tx.ticketItem.findFirst({ where: { id: itemId, ticketId: id } });
      if (!item) throw new NotFoundException("Item não encontrado.");
      await tx.ticketItem.delete({ where: { id: itemId } });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  // Vincula, troca ou remove o cliente de uma comanda ABERTA. O cliente tem que ser do mesmo tenant
  // (checado aqui, nunca confiando no id do body) e comanda aberta a partir de um agendamento mantém o
  // cliente do agendamento: ele é a fonte de verdade, trocar aqui deixaria os dois divergentes.
  async setClient(tenantId: string, id: string, dto: SetTicketClientDto) {
    await this.lockedOpenTicket(tenantId, id, async (tx, ticket) => {
      if (ticket.appointmentId) {
        throw new ConflictException(
          "Esta comanda veio de um agendamento: o cliente é o do agendamento e não pode ser trocado aqui.",
        );
      }
      if (dto.clientId !== null) {
        const client = await tx.client.findFirst({
          where: { id: dto.clientId, tenantId },
          select: { id: true },
        });
        if (!client) throw new NotFoundException("Cliente não encontrado.");
      }
      // tenantId também no WHERE da escrita, não só na leitura acima.
      await tx.ticket.updateMany({ where: { id, tenantId }, data: { clientId: dto.clientId } });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  async setDiscount(tenantId: string, id: string, dto: SetTicketDiscountDto) {
    await this.lockedOpenTicket(tenantId, id, async (tx, ticket) => {
      const subtotal = this.subtotalCents(ticket);
      if (dto.discountCents > subtotal) {
        throw new BadRequestException("Desconto maior que o subtotal.");
      }
      await tx.ticket.update({ where: { id }, data: { discountCents: dto.discountCents } });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  async addPayment(tenantId: string, id: string, dto: AddPaymentDto) {
    await this.lockedOpenTicket(tenantId, id, async (tx, ticket) => {
      const coverage = await this.club.coverageForTicket(tx, tenantId, this.coverageInput(ticket));
      const total = this.totalCents(ticket, coverage.coveredCents);
      const paid = ticket.payments.reduce((sum, p) => sum + p.amountCents, 0);
      if (paid + dto.amountCents > total) {
        throw new BadRequestException(
          `Pagamento excede o restante da comanda (${total - paid}).`,
        );
      }

      const openRegister =
        dto.method === "CASH" ? await this.cashRegister.currentOpen(tenantId, tx) : null;

      await tx.payment.create({
        data: {
          tenantId,
          ticketId: id,
          method: dto.method as PaymentMethod,
          amountCents: dto.amountCents,
          cashRegisterId: openRegister?.id ?? null,
        },
      });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  async close(tenantId: string, userId: string, id: string) {
    return this.lockedOpenTicket(tenantId, id, async (tx, ticket) => {
      if (ticket.items.length === 0) {
        throw new BadRequestException("Comanda sem itens.");
      }
      // Clube de assinaturas: o servidor decide quais serviços do membro saem sem cobrança (nunca o cliente HTTP). Com lock na
      // adesão, para dois fechamentos simultâneos do mesmo membro não gastarem o mesmo uso.
      const coverage = await this.club.coverageForTicket(tx, tenantId, this.coverageInput(ticket), { lock: true });
      const total = this.totalCents(ticket, coverage.coveredCents);
      const paid = ticket.payments.reduce((sum, p) => sum + p.amountCents, 0);
      if (paid < total) {
        throw new BadRequestException(`Faltam ${total - paid} centavos em pagamento.`);
      }

      await this.club.recordUsage(tx, tenantId, id, coverage);
      const closed = await tx.ticket.update({
        where: { id },
        data: { status: TicketStatus.CLOSED, closedAt: new Date(), clubCoveredCents: coverage.coveredCents },
        include: TICKET_INCLUDE,
      });

      // Baixa de estoque dos produtos vendidos.
      for (const item of closed.items) {
        if (item.kind === TicketItemKind.PRODUCT && item.productId) {
          await this.products.registerSale(tx, tenantId, item.productId, item.quantity, item.id);
        }
      }

      // Comissões.
      await this.commissions.computeForTicket(
        tx,
        tenantId,
        id,
        closed.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          serviceId: item.serviceId,
          productId: item.productId,
          professionalId: item.professionalId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
        })),
      );

      // Receita no financeiro (regime de caixa: já quitada, pois close exige pago >= total).
      await this.finance.recordTicketIncome(tx, tenantId, userId, {
        id,
        totalCents: this.totalCents(closed, closed.clubCoveredCents),
      });

      return this.serialize(closed);
    });
  }

  // Edita quantidade e/ou profissional de um item JÁ lançado (comanda aberta). Preço, tipo e serviço nunca mudam por aqui.
  async updateItem(tenantId: string, userId: string, id: string, itemId: string, dto: UpdateTicketItemDto) {
    if (dto.quantity === undefined && dto.professionalId === undefined) {
      throw new BadRequestException("Informe a quantidade ou o profissional.");
    }

    await this.lockedOpenTicket(tenantId, id, async (tx) => {
      const item = await tx.ticketItem.findFirst({
        where: { id: itemId, ticketId: id },
        include: { professional: { select: { user: { select: { name: true } } } } },
      });
      if (!item) throw new NotFoundException("Item não encontrado.");

      const data: Prisma.TicketItemUncheckedUpdateInput = {};
      const changes: string[] = [];

      if (dto.quantity !== undefined && dto.quantity !== item.quantity) {
        data.quantity = dto.quantity;
        changes.push(`quantidade ${item.quantity} → ${dto.quantity}`);
      }

      if (dto.professionalId !== undefined && dto.professionalId !== item.professionalId) {
        let newName = "sem profissional";
        if (dto.professionalId !== null) {
          // O profissional tem de ser DESTE negócio (nunca confiar no id do body).
          const professional = await tx.professional.findFirst({
            where: { id: dto.professionalId, tenantId },
            select: { id: true, user: { select: { name: true } } },
          });
          if (!professional) throw new NotFoundException("Profissional não encontrado.");
          newName = professional.user.name;
        }
        data.professionalId = dto.professionalId;
        changes.push(`profissional ${item.professional?.user.name ?? "sem profissional"} → ${newName}`);
      }

      if (changes.length === 0) return; // nada mudou: sem escrita e sem histórico
      await tx.ticketItem.update({ where: { id: itemId }, data });
      await this.audit(tx, tenantId, userId, id, TicketAuditAction.ITEM_UPDATED, `Item "${item.description}": ${changes.join("; ")}`);
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  // Observação da comanda aberta: texto troca, null limpa.
  async setNote(tenantId: string, id: string, dto: SetTicketNoteDto) {
    await this.lockedOpenTicket(tenantId, id, async (tx) => {
      const note = dto.note === null || dto.note.trim() === "" ? null : dto.note.trim();
      await tx.ticket.update({ where: { id }, data: { note } });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  // Estorna um pagamento lançado errado numa comanda ABERTA (é o que destrava corrigir ou cancelar). O dinheiro de um caixa JÁ
  // FECHADO não pode sumir: o fechamento do caixa foi conferido contra esses pagamentos.
  async removePayment(tenantId: string, userId: string, id: string, paymentId: string, dto: TicketReasonDto) {
    await this.lockedOpenTicket(tenantId, id, async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: paymentId, ticketId: id, tenantId } });
      if (!payment) throw new NotFoundException("Pagamento não encontrado.");

      if (payment.cashRegisterId) {
        const register = await tx.cashRegister.findFirst({ where: { id: payment.cashRegisterId, tenantId }, select: { status: true } });
        if (register?.status === CashRegisterStatus.CLOSED) {
          throw new ConflictException(
            "Este pagamento entrou num caixa que já foi fechado e conferido, então não pode ser removido. Registre a correção no financeiro.",
          );
        }
      }

      await tx.payment.delete({ where: { id: paymentId } });
      await this.audit(
        tx,
        tenantId,
        userId,
        id,
        TicketAuditAction.PAYMENT_REMOVED,
        `Pagamento ${payment.method} de ${formatBrl(payment.amountCents)} removido`,
        dto.reason,
      );
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  // Reabre uma comanda FECHADA: desfaz TUDO o que o fechamento gerou, na mesma transação e na ordem em que cada passo pode recusar
  // (comissão já repassada) antes de qualquer mudança definitiva. Os pagamentos ficam (continuam valendo se a comanda for fechada de
  // novo; se precisar tirar, é o estorno de pagamento). A comanda volta a ABERTA e o cálculo (clube, total) volta a ser feito na hora.
  async reopen(tenantId: string, userId: string, id: string, dto: TicketReasonDto) {
    await this.lockedClosedTicket(tenantId, id, async (tx, ticket) => {
      const commissions = await this.commissions.reverseForTicket(tx, tenantId, id);
      const income = await this.finance.reverseTicketIncome(tx, tenantId, id);
      const stock = await this.products.reverseSales(
        tx,
        tenantId,
        ticket.items.map((item) => item.id),
      );
      const club = await this.club.releaseUsage(tx, tenantId, id);

      await tx.ticket.update({
        where: { id },
        data: { status: TicketStatus.OPEN, closedAt: null, clubCoveredCents: 0 },
      });

      await this.audit(
        tx,
        tenantId,
        userId,
        id,
        TicketAuditAction.REOPENED,
        `Comanda reaberta: ${income.reversed ? "receita estornada" : "sem receita a estornar"}, ${commissions.count} comissão(ões) desfeita(s), ${stock.count} baixa(s) de estoque devolvida(s), ${club.count} uso(s) do clube devolvido(s)`,
        dto.reason,
      );
    });
    // Serializa DEPOIS do commit: a cobertura do clube é lida fora da transação e precisa enxergar os usos já devolvidos.
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  async history(tenantId: string, id: string) {
    // A comanda precisa ser DESTE negócio (mesmo 404 de inexistente); o histórico só é lido depois disso.
    await this.getOpenOrAny(tenantId, id);
    const rows = await this.prisma.ticketAuditLog.findMany({
      where: { tenantId, ticketId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, actorName: true, reason: true, detail: true, createdAt: true },
    });
    return rows;
  }

  async cancel(tenantId: string, id: string) {
    await this.lockedOpenTicket(tenantId, id, async (tx, ticket) => {
      if (ticket.payments.length > 0) {
        throw new BadRequestException("Estorne os pagamentos antes de cancelar a comanda.");
      }
      await tx.ticket.update({
        where: { id },
        data: { status: TicketStatus.CANCELED, canceledAt: new Date() },
      });
    });
    return this.serialize(await this.getOpenOrAny(tenantId, id));
  }

  // ─────────────────────────────────────────────

  private async getOpenOrAny(
    tenantId: string,
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const ticket = await db.ticket.findFirst({
      where: { id, tenantId },
      include: TICKET_INCLUDE,
    });
    if (!ticket) throw new NotFoundException("Comanda não encontrada.");
    return ticket;
  }

  private async requireOpen(
    tenantId: string,
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const ticket = await this.getOpenOrAny(tenantId, id, db);
    if (ticket.status !== TicketStatus.OPEN) {
      throw new ConflictException("Comanda não está aberta.");
    }
    return ticket;
  }

  // Toda mutação de uma comanda roda serializada por um advisory lock da própria comanda e
  // relê o status DENTRO da transação. Ler "está aberta?" fora e escrever depois deixava duas
  // requisições concorrentes (duplo clique, retry, dois caixas) passarem juntas pela checagem:
  // fechar duas vezes gerava receita, comissão e baixa de estoque em dobro, e dois pagamentos
  // simultâneos ultrapassavam o total. O lock é por comanda — não bloqueia as demais.
  private lockedOpenTicket<T>(
    tenantId: string,
    id: string,
    fn: (tx: Prisma.TransactionClient, ticket: TicketWithRelations) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id})::bigint)`;
      const ticket = await this.requireOpen(tenantId, id, tx);
      return fn(tx, ticket);
    });
  }

  // Mesmo lock por comanda, mas para uma comanda FECHADA (reabertura). O status é relido DENTRO do lock: dois "reabrir"
  // simultâneos não desfazem a receita/comissão duas vezes.
  private lockedClosedTicket<T>(
    tenantId: string,
    id: string,
    fn: (tx: Prisma.TransactionClient, ticket: TicketWithRelations) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id})::bigint)`;
      const ticket = await this.getOpenOrAny(tenantId, id, tx);
      if (ticket.status !== TicketStatus.CLOSED) {
        throw new ConflictException("Só uma comanda fechada pode ser reaberta.");
      }
      return fn(tx, ticket);
    });
  }

  // Histórico de quem mexeu em dinheiro já lançado. O nome de quem agiu fica GRAVADO (o usuário pode ser excluído depois).
  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    ticketId: string,
    action: TicketAuditAction,
    detail: string,
    reason?: string,
  ) {
    const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { name: true } });
    await tx.ticketAuditLog.create({
      data: { tenantId, ticketId, action, actorUserId: userId, actorName: actor?.name ?? "Usuário", reason: reason ?? null, detail },
    });
  }

  private subtotalCents(ticket: TicketWithRelations) {
    return ticket.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  }

  // total = itens − desconto manual − serviços cobertos pelo clube. `clubCoveredCents` é calculado na hora para comanda aberta e
  // vem GRAVADO (ticket.clubCoveredCents) para comanda fechada.
  private totalCents(ticket: TicketWithRelations, clubCoveredCents: number) {
    return Math.max(0, this.subtotalCents(ticket) - ticket.discountCents - clubCoveredCents);
  }

  private coverageInput(ticket: TicketWithRelations) {
    return {
      clientId: ticket.clientId,
      items: ticket.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        createdAt: item.createdAt,
      })),
    };
  }

  private async serialize(ticket: TicketWithRelations, options: { clubActive?: boolean } = {}) {
    const isOpen = ticket.status === TicketStatus.OPEN;
    let coverage: TicketCoverage | null = null;
    if (isOpen && options.clubActive !== false) {
      coverage = await this.club.coverageForTicket(this.prisma, ticket.tenantId, this.coverageInput(ticket), {
        assumeActive: options.clubActive === true,
      });
    }
    const coveredByItem = new Map((coverage?.lines ?? []).map((line) => [line.itemId, line]));
    const clubCoveredCents = isOpen ? (coverage?.coveredCents ?? 0) : ticket.clubCoveredCents;

    const subtotalCents = this.subtotalCents(ticket);
    const totalCents = this.totalCents(ticket, clubCoveredCents);
    const paidCents = ticket.payments.reduce((sum, p) => sum + p.amountCents, 0);
    return {
      id: ticket.id,
      status: ticket.status,
      appointmentId: ticket.appointmentId,
      client: ticket.client,
      note: ticket.note,
      openedAt: ticket.openedAt,
      closedAt: ticket.closedAt,
      canceledAt: ticket.canceledAt,
      discountCents: ticket.discountCents,
      clubCoveredCents,
      subtotalCents,
      totalCents,
      paidCents,
      dueCents: Math.max(0, totalCents - paidCents),
      items: ticket.items.map((item) => {
        const line = coveredByItem.get(item.id);
        return {
          id: item.id,
          kind: item.kind,
          serviceId: item.serviceId,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.unitPriceCents * item.quantity,
          // Quanto deste item o clube cobre (aberta: previsão do servidor; fechada: o que foi de fato baixado).
          clubCoveredUnits: isOpen ? (line?.units ?? 0) : (item.clubUsage?.units ?? 0),
          clubCoveredCents: isOpen ? (line?.coveredCents ?? 0) : (item.clubUsage?.coveredCents ?? 0),
          createdAt: item.createdAt,
          professional: item.professional
            ? { id: item.professionalId, name: item.professional.user.name }
            : null,
        };
      }),
      payments: ticket.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amountCents: payment.amountCents,
        createdAt: payment.createdAt,
      })),
    };
  }
}

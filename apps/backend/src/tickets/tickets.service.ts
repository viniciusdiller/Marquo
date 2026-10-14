import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PaymentMethod, Prisma, TicketItemKind, TicketStatus } from "@totalagenda/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { FinanceService } from "../finance/finance.service";
import {
  AddPaymentDto,
  AddTicketItemDto,
  OpenTicketDto,
  SetTicketClientDto,
  SetTicketDiscountDto,
} from "./dto/ticket-dtos";
import { resolvePagination } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";

const TICKET_INCLUDE = {
  items: { include: { professional: { include: { user: { select: { name: true } } } } } },
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
      if (appointment.ticket) {
        throw new ConflictException("Este atendimento já tem uma comanda.");
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
    return tickets.map((ticket) => this.serialize(ticket));
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
      const total = this.totalCents(ticket);
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
      const total = this.totalCents(ticket);
      const paid = ticket.payments.reduce((sum, p) => sum + p.amountCents, 0);
      if (paid < total) {
        throw new BadRequestException(`Faltam ${total - paid} centavos em pagamento.`);
      }

      const closed = await tx.ticket.update({
        where: { id },
        data: { status: TicketStatus.CLOSED, closedAt: new Date() },
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
        totalCents: this.totalCents(closed),
      });

      return this.serialize(closed);
    });
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

  private subtotalCents(ticket: TicketWithRelations) {
    return ticket.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  }

  private totalCents(ticket: TicketWithRelations) {
    return Math.max(0, this.subtotalCents(ticket) - ticket.discountCents);
  }

  private serialize(ticket: TicketWithRelations) {
    const subtotalCents = this.subtotalCents(ticket);
    const totalCents = this.totalCents(ticket);
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
      subtotalCents,
      totalCents,
      paidCents,
      dueCents: Math.max(0, totalCents - paidCents),
      items: ticket.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        serviceId: item.serviceId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.unitPriceCents * item.quantity,
        createdAt: item.createdAt,
        professional: item.professional
          ? { id: item.professionalId, name: item.professional.user.name }
          : null,
      })),
      payments: ticket.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amountCents: payment.amountCents,
        createdAt: payment.createdAt,
      })),
    };
  }
}

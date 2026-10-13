import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGeneralBalance(tenantId: string, startDate: Date, endDate: Date) {
    // Busca apenas Tickets fechados no período e dentro do isolamento de tenant
    const closedTickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        status: 'CLOSED',
        closedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        discountCents: true,
        items: { select: { unitPriceCents: true, quantity: true } }
      },
    });

    let totalRevenueCents = 0;
    for (const t of closedTickets) {
      const subtotal = t.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
      totalRevenueCents += Math.max(0, subtotal - t.discountCents);
    }
    const totalTickets = closedTickets.length;
    const averageTicketCents = totalTickets > 0 ? Math.floor(totalRevenueCents / totalTickets) : 0;

    const ticketIds = closedTickets.map((t) => t.id);

    if (ticketIds.length === 0) {
      return {
        totalRevenueCents: 0,
        totalTickets: 0,
        averageTicketCents: 0,
        totalServices: 0,
        mostRequestedService: null,
        totalProducts: 0,
        mostSoldProduct: null,
      };
    }

    // Conta serviços e produtos
    const items = await this.prisma.ticketItem.findMany({
      where: {
        ticketId: { in: ticketIds },
      },
      select: {
        kind: true,
        serviceId: true,
        productId: true,
        description: true,
        quantity: true,
      },
    });

    let totalServices = 0;
    let totalProducts = 0;
    const serviceCounts: Record<string, { count: number; name: string }> = {};
    const productCounts: Record<string, { count: number; name: string }> = {};

    for (const item of items) {
      if (item.kind === 'SERVICE') {
        totalServices += item.quantity;
        const key = item.serviceId || item.description;
        if (!serviceCounts[key]) serviceCounts[key] = { count: 0, name: item.description };
        serviceCounts[key].count += item.quantity;
      } else if (item.kind === 'PRODUCT') {
        totalProducts += item.quantity;
        const key = item.productId || item.description;
        if (!productCounts[key]) productCounts[key] = { count: 0, name: item.description };
        productCounts[key].count += item.quantity;
      }
    }

    let mostRequestedService = null;
    let maxServiceCount = 0;
    for (const [key, val] of Object.entries(serviceCounts)) {
      if (val.count > maxServiceCount) {
        maxServiceCount = val.count;
        mostRequestedService = { name: val.name, count: val.count };
      }
    }

    let mostSoldProduct = null;
    let maxProductCount = 0;
    for (const [key, val] of Object.entries(productCounts)) {
      if (val.count > maxProductCount) {
        maxProductCount = val.count;
        mostSoldProduct = { name: val.name, count: val.count };
      }
    }

    return {
      totalRevenueCents,
      totalTickets,
      averageTicketCents,
      totalServices,
      mostRequestedService,
      totalProducts,
      mostSoldProduct,
    };
  }

  async getClientMonthlyBalance(tenantId: string, clientId: string, year: number, month: number) {
    // Filtro de início e fim do mês. Trabalhamos em UTC, delegando fuso América/SP para manipulação
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    // Isolamento pelo JWT (tenantId) e clientId validado juntos na query (Regra Anti-IDOR do AGENTS.md)
    const closedTickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        clientId,
        status: 'CLOSED',
        closedAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        id: true,
      },
    });

    const ticketIds = closedTickets.map((t) => t.id);

    if (ticketIds.length === 0) {
      return { totalServices: 0 };
    }

    const items = await this.prisma.ticketItem.aggregate({
      where: {
        ticketId: { in: ticketIds },
        kind: 'SERVICE',
      },
      _sum: {
        quantity: true,
      },
    });

    return {
      totalServices: items._sum.quantity || 0,
    };
  }
}

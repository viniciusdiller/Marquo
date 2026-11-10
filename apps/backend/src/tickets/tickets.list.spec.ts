import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Role } from "@marquo/database";
import { TicketsService } from "./tickets.service";
import { TicketsController } from "./tickets.controller";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { ClubService } from "../club/club.service";
import { FinanceService } from "../finance/finance.service";

// Uma comanda fechada NÃO pode sumir: é o registro do atendimento. A lista tem o histórico (fechadas e canceladas), paginado.

const NOW = new Date("2026-11-11T15:00:00.000Z");

function closedTicket(id: string) {
  return {
    id,
    tenantId: "t-1",
    status: "CLOSED",
    appointmentId: null,
    clientId: null,
    note: null,
    openedAt: NOW,
    closedAt: NOW,
    canceledAt: null,
    discountCents: 0,
    clubCoveredCents: 1000,
    items: [{ id: `${id}-i`, kind: "SERVICE", serviceId: "s", productId: null, professionalId: null, description: "Corte", quantity: 1, unitPriceCents: 5000, createdAt: NOW, clubUsage: { units: 1, coveredCents: 1000 }, professional: null }],
    payments: [{ id: "p", method: "PIX", amountCents: 4000, createdAt: NOW }],
    client: null,
    appointment: null,
  };
}

function build(rows: unknown[] = [closedTicket("a"), closedTicket("b")], total = 2) {
  const prisma = {
    ticket: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(total) },
  } as unknown as PrismaService;
  const club = { isActive: jest.fn(), coverageForTicket: jest.fn() };
  const service = new TicketsService(
    prisma,
    {} as ProductsService,
    {} as CommissionsService,
    {} as CashRegisterService,
    {} as FinanceService,
    club as unknown as ClubService,
  );
  return { service, prisma, club };
}

describe("TicketsService.findFinished", () => {
  it("lista as FECHADAS do negócio, da mais recente para a mais antiga, paginado", async () => {
    const { service, prisma } = build();
    const page = await service.findFinished("t-1", "CLOSED", { page: 2, pageSize: 5 });

    const call = (prisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: "t-1", status: "CLOSED" });
    expect(call.orderBy).toEqual([{ closedAt: "desc" }, { id: "desc" }]);
    expect(call).toMatchObject({ skip: 5, take: 5 });
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 5, pageCount: 1 });
    expect(page.items).toHaveLength(2);
  });

  it("as CANCELADAS ordenam pelo cancelamento", async () => {
    const { service, prisma } = build([], 0);
    await service.findFinished("t-1", "CANCELED", {});
    const call = (prisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: "t-1", status: "CANCELED" });
    expect(call.orderBy).toEqual([{ canceledAt: "desc" }, { id: "desc" }]);
  });

  it("conta com o MESMO filtro (tenantId e status) e usa a paginação padrão", async () => {
    const { service, prisma } = build();
    await service.findFinished("t-1", "CLOSED", {});
    expect((prisma.ticket.count as jest.Mock).mock.calls[0][0]).toEqual({ where: { tenantId: "t-1", status: "CLOSED" } });
    expect((prisma.ticket.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({ skip: 0, take: 10 });
  });

  it("mostra o valor GRAVADO do clube e o total já descontado, sem consultar o clube de novo (N+1)", async () => {
    const { service, club } = build();
    const page = await service.findFinished("t-1", "CLOSED", {});
    expect(club.coverageForTicket).not.toHaveBeenCalled();
    expect(club.isActive).not.toHaveBeenCalled();
    expect(page.items[0]).toMatchObject({ status: "CLOSED", subtotalCents: 5000, clubCoveredCents: 1000, totalCents: 4000, dueCents: 0 });
  });

  it("sem comandas devolve uma página vazia com pageCount 1", async () => {
    const { service } = build([], 0);
    expect(await service.findFinished("t-1", "CLOSED", {})).toMatchObject({ items: [], total: 0, pageCount: 1 });
  });
});

describe("TicketsController.list", () => {
  const user = { userId: "u-1", tenantId: "t-1", role: Role.OWNER };
  function controller() {
    const tickets = { findOpen: jest.fn().mockResolvedValue([]), findFinished: jest.fn().mockResolvedValue({}) };
    return { tickets, c: new TicketsController(tickets as never) };
  }

  it("sem status (ou OPEN) lista as abertas, como sempre", () => {
    const { tickets, c } = controller();
    c.list(user, {});
    c.list(user, { status: "OPEN" });
    expect(tickets.findOpen).toHaveBeenCalledTimes(2);
    expect(tickets.findFinished).not.toHaveBeenCalled();
  });

  it("CLOSED e CANCELED vão para o histórico, sempre com o tenantId do TOKEN", () => {
    const { tickets, c } = controller();
    c.list(user, { status: "CLOSED", page: 2 });
    c.list(user, { status: "CANCELED" });
    expect(tickets.findFinished).toHaveBeenNthCalledWith(1, "t-1", "CLOSED", { status: "CLOSED", page: 2 });
    expect(tickets.findFinished).toHaveBeenNthCalledWith(2, "t-1", "CANCELED", { status: "CANCELED" });
  });
});

describe("ListTicketsQueryDto", () => {
  const check = async (q: Record<string, unknown>) =>
    (await validate(plainToInstance(ListTicketsQueryDto, q), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

  it("aceita os três status e a paginação", async () => {
    for (const status of ["OPEN", "CLOSED", "CANCELED"]) expect(await check({ status })).toEqual([]);
    expect(await check({ status: "CLOSED", page: "2", pageSize: "15" })).toEqual([]);
  });

  it("recusa status desconhecido, em minúsculas ou com texto solto", async () => {
    for (const status of ["closed", "ALL", "x'; DROP", ""]) expect(await check({ status })).toContain("status");
  });

  it("mantém o teto da página (50)", async () => {
    expect(await check({ pageSize: "1000" })).toContain("pageSize");
  });
});

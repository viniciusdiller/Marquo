import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { TicketsService } from "./tickets.service";
import { SetTicketClientDto } from "./dto/ticket-dtos";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { ClubService } from "../club/club.service";
import { FinanceService } from "../finance/finance.service";

const CLIENT = "3f2b8c1e-8a3d-4c55-9d5e-0a1b2c3d4e5f";

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: "tk-1",
    status: "OPEN",
    appointmentId: null,
    clientId: null,
    note: null,
    openedAt: new Date("2026-10-06T13:00:00Z"),
    closedAt: null,
    canceledAt: null,
    discountCents: 0,
    items: [],
    payments: [],
    client: null,
    appointment: null,
    ...over,
  };
}

function build(found: unknown = ticket(), clientFound: unknown = { id: CLIENT }) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    ticket: {
      findFirst: jest.fn().mockResolvedValue(found),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    client: { findFirst: jest.fn().mockResolvedValue(clientFound) },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    ticket: { findFirst: jest.fn().mockResolvedValue(found) },
  };
  const service = new TicketsService(
    prisma as unknown as PrismaService,
    {} as ProductsService,
    {} as CommissionsService,
    {} as CashRegisterService,
    {} as FinanceService,
    { coverageForTicket: jest.fn().mockResolvedValue({ coveredCents: 0, lines: [], membership: null }) } as unknown as ClubService,
  );
  return { tx, prisma, service };
}

describe("TicketsService.setClient", () => {
  it("vincula o cliente validando que ele é do MESMO tenant e grava com tenantId no WHERE", async () => {
    const { service, tx } = build();
    await service.setClient("tenant-A", "tk-1", { clientId: CLIENT });

    expect(tx.client.findFirst).toHaveBeenCalledWith({ where: { id: CLIENT, tenantId: "tenant-A" }, select: { id: true } });
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({ where: { id: "tk-1", tenantId: "tenant-A" }, data: { clientId: CLIENT } });
  });

  // IDOR: o clientId vem do body. Cliente de outro negócio tem que parecer inexistente.
  it("cliente de OUTRO tenant dá 404 e nada é gravado", async () => {
    const { service, tx } = build(ticket(), null);
    await expect(service.setClient("tenant-A", "tk-1", { clientId: CLIENT })).rejects.toThrow(NotFoundException);
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("clientId null desvincula o cliente (sem consultar cliente nenhum)", async () => {
    const { service, tx } = build(ticket({ clientId: CLIENT }));
    await service.setClient("t-1", "tk-1", { clientId: null });
    expect(tx.client.findFirst).not.toHaveBeenCalled();
    expect(tx.ticket.updateMany.mock.calls[0][0].data).toEqual({ clientId: null });
  });

  it("comanda FECHADA não aceita trocar o cliente (409) — o registro do atendimento não muda depois", async () => {
    const { service, tx } = build(ticket({ status: "CLOSED" }));
    await expect(service.setClient("t-1", "tk-1", { clientId: CLIENT })).rejects.toThrow(ConflictException);
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("comanda CANCELADA também é recusada", async () => {
    const { service } = build(ticket({ status: "CANCELED" }));
    await expect(service.setClient("t-1", "tk-1", { clientId: CLIENT })).rejects.toThrow(ConflictException);
  });

  it("comanda aberta a partir de agendamento mantém o cliente do agendamento (409)", async () => {
    const { service, tx } = build(ticket({ appointmentId: "ap-1", clientId: "outro" }));
    await expect(service.setClient("t-1", "tk-1", { clientId: CLIENT })).rejects.toThrow("agendamento");
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("comanda de outro tenant (ou inexistente) dá 404", async () => {
    const { service } = build(null);
    await expect(service.setClient("t-1", "tk-1", { clientId: CLIENT })).rejects.toThrow("Comanda não encontrada.");
  });

  it("serializa o registro de datas (cancelamento e item)", async () => {
    const { service } = build(
      ticket({
        items: [
          {
            id: "it-1", kind: "SERVICE", serviceId: "s", productId: null, professionalId: null, description: "Corte",
            quantity: 1, unitPriceCents: 5000, createdAt: new Date("2026-10-06T13:05:00Z"), professional: null,
          },
        ],
      }),
    );
    const r = await service.setClient("t-1", "tk-1", { clientId: null });
    expect(r.items[0].createdAt).toEqual(new Date("2026-10-06T13:05:00Z"));
    expect(r).toHaveProperty("canceledAt", null);
  });

  it("a mutação roda com o lock da comanda, antes de ler o status", async () => {
    const { service, tx } = build();
    await service.setClient("t-1", "tk-1", { clientId: null });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.ticket.findFirst.mock.invocationCallOrder[0]);
  });
});

describe("SetTicketClientDto", () => {
  const errs = async (payload: Record<string, unknown>) => (await validate(plainToInstance(SetTicketClientDto, payload))).map((e) => e.property);

  it("aceita UUID e null", async () => {
    expect(await errs({ clientId: CLIENT })).toEqual([]);
    expect(await errs({ clientId: null })).toEqual([]);
  });

  it.each<[Record<string, unknown>, string]>([
    [{}, "clientId ausente NÃO vira 'desvincular' em silêncio"],
    [{ clientId: "1 OR 1=1" }, "não é UUID"],
    [{ clientId: "" }, "string vazia"],
    [{ clientId: { $ne: null } }, "objeto no lugar do id"],
  ])("rejeita %j (%s)", async (payload) => {
    expect(await errs(payload)).toContain("clientId");
  });
});

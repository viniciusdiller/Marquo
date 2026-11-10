import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { ClubService } from "../club/club.service";
import { FinanceService } from "../finance/finance.service";

// Editar e desfazer comanda: tudo que mexe em dinheiro já lançado é conferido NO servidor, com lock por comanda, tenantId no WHERE e
// histórico de quem fez e por quê.

const NOW = new Date("2026-11-11T15:00:00.000Z");

function item(over: Record<string, unknown> = {}) {
  return {
    id: "it-1",
    kind: "SERVICE",
    serviceId: "svc-1",
    productId: null,
    professionalId: "prof-1",
    description: "Corte",
    quantity: 1,
    unitPriceCents: 5000,
    createdAt: NOW,
    clubUsage: null,
    professional: { user: { name: "Alex" } },
    ...over,
  };
}

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: "tk-1",
    tenantId: "t-1",
    status: "OPEN",
    appointmentId: null,
    clientId: null,
    note: null,
    openedAt: NOW,
    closedAt: null,
    canceledAt: null,
    discountCents: 0,
    clubCoveredCents: 0,
    items: [item()],
    payments: [] as Array<Record<string, unknown>>,
    client: null,
    appointment: null,
    ...over,
  };
}

function build(opts: { ticket?: ReturnType<typeof ticket>; reverseCommissions?: () => Promise<{ count: number }> } = {}) {
  const current = opts.ticket ?? ticket();
  const models = {
    ticket: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue({}),
    },
    ticketItem: {
      findFirst: jest.fn().mockResolvedValue(item()),
      update: jest.fn().mockResolvedValue({}),
    },
    professional: { findFirst: jest.fn().mockResolvedValue({ id: "prof-2", user: { name: "Bruna" } }) },
    payment: {
      findFirst: jest.fn().mockResolvedValue({ id: "pay-1", method: "PIX", amountCents: 5000, cashRegisterId: null }),
      delete: jest.fn().mockResolvedValue({}),
    },
    cashRegister: { findFirst: jest.fn().mockResolvedValue({ status: "OPEN" }) },
    user: { findFirst: jest.fn().mockResolvedValue({ name: "Dono" }) },
    ticketAuditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  };
  const tx = { ...models, $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = {
    ...models,
    $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const order: string[] = [];
  const commissions = {
    computeForTicket: jest.fn(),
    reverseForTicket: jest.fn().mockImplementation(opts.reverseCommissions ?? (async () => { order.push("commissions"); return { count: 2 }; })),
  };
  const finance = {
    recordTicketIncome: jest.fn(),
    reverseTicketIncome: jest.fn().mockImplementation(async () => { order.push("finance"); return { reversed: true }; }),
  };
  const products = {
    registerSale: jest.fn(),
    reverseSales: jest.fn().mockImplementation(async () => { order.push("stock"); return { count: 1 }; }),
  };
  const club = {
    isActive: jest.fn().mockResolvedValue(false),
    coverageForTicket: jest.fn().mockResolvedValue({ coveredCents: 0, lines: [], membership: null }),
    recordUsage: jest.fn(),
    releaseUsage: jest.fn().mockImplementation(async () => { order.push("club"); return { count: 1 }; }),
  };
  const service = new TicketsService(
    prisma,
    products as unknown as ProductsService,
    commissions as unknown as CommissionsService,
    { currentOpen: jest.fn().mockResolvedValue(null) } as unknown as CashRegisterService,
    finance as unknown as FinanceService,
    club as unknown as ClubService,
  );
  return { service, models, tx, commissions, finance, products, club, order };
}

describe("TicketsService.updateItem", () => {
  it("troca quantidade e profissional, grava o histórico e relê a comanda", async () => {
    const { service, models } = build();
    await service.updateItem("t-1", "u-1", "tk-1", "it-1", { quantity: 3, professionalId: "prof-2" });

    expect(models.ticketItem.update).toHaveBeenCalledWith({ where: { id: "it-1" }, data: { quantity: 3, professionalId: "prof-2" } });
    const log = models.ticketAuditLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ tenantId: "t-1", ticketId: "tk-1", action: "ITEM_UPDATED", actorUserId: "u-1", actorName: "Dono" });
    expect(log.detail).toContain("quantidade 1 → 3");
    expect(log.detail).toContain("profissional Alex → Bruna");
  });

  it("null deixa o item sem profissional", async () => {
    const { service, models } = build();
    await service.updateItem("t-1", "u-1", "tk-1", "it-1", { professionalId: null });
    expect(models.ticketItem.update.mock.calls[0][0].data).toEqual({ professionalId: null });
    expect(models.ticketAuditLog.create.mock.calls[0][0].data.detail).toContain("sem profissional");
  });

  it("sem nenhuma mudança real não escreve nem registra histórico", async () => {
    const { service, models } = build();
    await service.updateItem("t-1", "u-1", "tk-1", "it-1", { quantity: 1, professionalId: "prof-1" });
    expect(models.ticketItem.update).not.toHaveBeenCalled();
    expect(models.ticketAuditLog.create).not.toHaveBeenCalled();
  });

  it("exige pelo menos a quantidade ou o profissional", async () => {
    const { service } = build();
    await expect(service.updateItem("t-1", "u-1", "tk-1", "it-1", {})).rejects.toThrow(BadRequestException);
  });

  // Segurança (IDOR): o profissional do body só vale se for DESTE negócio.
  it("profissional de outro negócio dá 404 e nada é alterado", async () => {
    const { service, models } = build();
    models.professional.findFirst.mockResolvedValue(null);
    await expect(service.updateItem("t-1", "u-1", "tk-1", "it-1", { professionalId: "de-outro" })).rejects.toThrow(NotFoundException);
    expect(models.professional.findFirst.mock.calls[0][0].where).toEqual({ id: "de-outro", tenantId: "t-1" });
    expect(models.ticketItem.update).not.toHaveBeenCalled();
  });

  it("o item tem de ser DESTA comanda (ticketId no WHERE); de outra comanda é 404", async () => {
    const { service, models } = build();
    models.ticketItem.findFirst.mockResolvedValue(null);
    await expect(service.updateItem("t-1", "u-1", "tk-1", "de-outra", { quantity: 2 })).rejects.toThrow(NotFoundException);
    expect(models.ticketItem.findFirst.mock.calls[0][0].where).toEqual({ id: "de-outra", ticketId: "tk-1" });
  });

  it("comanda fechada não aceita edição de item (409)", async () => {
    const { service, models } = build({ ticket: ticket({ status: "CLOSED" }) });
    await expect(service.updateItem("t-1", "u-1", "tk-1", "it-1", { quantity: 2 })).rejects.toThrow(ConflictException);
    expect(models.ticketItem.update).not.toHaveBeenCalled();
  });

  it("roda com o lock da comanda e busca a comanda do negócio (tenantId no WHERE)", async () => {
    const { service, tx, models } = build();
    await service.updateItem("t-1", "u-1", "tk-1", "it-1", { quantity: 2 });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(models.ticket.findFirst.mock.calls[0][0].where).toEqual({ id: "tk-1", tenantId: "t-1" });
  });
});

describe("TicketsService.setNote", () => {
  it("grava o texto aparado e limpa com null/em branco", async () => {
    const { service, models } = build();
    await service.setNote("t-1", "tk-1", { note: "  cliente alérgico a X  " });
    expect(models.ticket.update.mock.calls[0][0]).toEqual({ where: { id: "tk-1" }, data: { note: "cliente alérgico a X" } });
    await service.setNote("t-1", "tk-1", { note: null });
    expect(models.ticket.update.mock.calls[1][0].data).toEqual({ note: null });
    await service.setNote("t-1", "tk-1", { note: "   " });
    expect(models.ticket.update.mock.calls[2][0].data).toEqual({ note: null });
  });

  it("comanda fechada ou de outro negócio não aceita", async () => {
    const closed = build({ ticket: ticket({ status: "CLOSED" }) });
    await expect(closed.service.setNote("t-1", "tk-1", { note: "x" })).rejects.toThrow(ConflictException);
    const other = build();
    other.models.ticket.findFirst.mockResolvedValue(null);
    await expect(other.service.setNote("t-1", "de-outro", { note: "x" })).rejects.toThrow(NotFoundException);
  });
});

describe("TicketsService.removePayment", () => {
  it("remove o pagamento e registra quem, quanto e por quê", async () => {
    const { service, models } = build();
    await service.removePayment("t-1", "u-1", "tk-1", "pay-1", { reason: "valor digitado errado" });

    expect(models.payment.delete).toHaveBeenCalledWith({ where: { id: "pay-1" } });
    const log = models.ticketAuditLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ action: "PAYMENT_REMOVED", actorUserId: "u-1", reason: "valor digitado errado" });
    expect(log.detail).toMatch(/PIX.*R\$\s?50,00/);
  });

  it("o pagamento tem de ser DESTA comanda e deste negócio; senão 404 e nada é apagado", async () => {
    const { service, models } = build();
    models.payment.findFirst.mockResolvedValue(null);
    await expect(service.removePayment("t-1", "u-1", "tk-1", "de-outra", { reason: "teste" })).rejects.toThrow(NotFoundException);
    expect(models.payment.findFirst.mock.calls[0][0].where).toEqual({ id: "de-outra", ticketId: "tk-1", tenantId: "t-1" });
    expect(models.payment.delete).not.toHaveBeenCalled();
  });

  it("dinheiro que entrou num caixa já FECHADO não pode ser removido (409)", async () => {
    const { service, models } = build();
    models.payment.findFirst.mockResolvedValue({ id: "pay-1", method: "CASH", amountCents: 5000, cashRegisterId: "cr-1" });
    models.cashRegister.findFirst.mockResolvedValue({ status: "CLOSED" });
    await expect(service.removePayment("t-1", "u-1", "tk-1", "pay-1", { reason: "teste" })).rejects.toThrow(/caixa que já foi fechado/);
    expect(models.cashRegister.findFirst.mock.calls[0][0].where).toEqual({ id: "cr-1", tenantId: "t-1" });
    expect(models.payment.delete).not.toHaveBeenCalled();
    expect(models.ticketAuditLog.create).not.toHaveBeenCalled();
  });

  it("dinheiro de um caixa ainda ABERTO pode ser removido", async () => {
    const { service, models } = build();
    models.payment.findFirst.mockResolvedValue({ id: "pay-1", method: "CASH", amountCents: 5000, cashRegisterId: "cr-1" });
    await service.removePayment("t-1", "u-1", "tk-1", "pay-1", { reason: "teste" });
    expect(models.payment.delete).toHaveBeenCalled();
  });

  it("em comanda fechada só reabrindo: remover pagamento é 409", async () => {
    const { service, models } = build({ ticket: ticket({ status: "CLOSED" }) });
    await expect(service.removePayment("t-1", "u-1", "tk-1", "pay-1", { reason: "teste" })).rejects.toThrow(ConflictException);
    expect(models.payment.delete).not.toHaveBeenCalled();
  });
});

describe("TicketsService.reopen", () => {
  const closed = () => ticket({ status: "CLOSED", closedAt: NOW, clubCoveredCents: 5000, items: [item(), item({ id: "it-2", kind: "PRODUCT", serviceId: null })] });

  it("desfaz TODOS os efeitos do fechamento e volta a comanda para ABERTA", async () => {
    const { service, models, commissions, finance, products, club } = build({ ticket: closed() });
    await service.reopen("t-1", "u-1", "tk-1", { reason: "item lançado errado" });

    expect(commissions.reverseForTicket).toHaveBeenCalledWith(expect.anything(), "t-1", "tk-1");
    expect(finance.reverseTicketIncome).toHaveBeenCalledWith(expect.anything(), "t-1", "tk-1");
    expect(products.reverseSales).toHaveBeenCalledWith(expect.anything(), "t-1", ["it-1", "it-2"]);
    expect(club.releaseUsage).toHaveBeenCalledWith(expect.anything(), "t-1", "tk-1");
    expect(models.ticket.update.mock.calls[0][0]).toEqual({ where: { id: "tk-1" }, data: { status: "OPEN", closedAt: null, clubCoveredCents: 0 } });
  });

  it("registra no histórico quem reabriu, o motivo e o que foi desfeito", async () => {
    const { service, models } = build({ ticket: closed() });
    await service.reopen("t-1", "u-1", "tk-1", { reason: "item lançado errado" });
    const log = models.ticketAuditLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ action: "REOPENED", actorName: "Dono", reason: "item lançado errado" });
    expect(log.detail).toMatch(/receita estornada, 2 comissão\(ões\).*1 baixa.*1 uso/);
  });

  // A comissão é o único passo que pode RECUSAR (já repassada): tem de vir antes de qualquer mudança definitiva.
  it("se a comissão já foi repassada, recusa SEM estornar receita, devolver estoque nem mexer na comanda", async () => {
    const { service, models, finance, products, club } = build({
      ticket: closed(),
      reverseCommissions: async () => {
        throw new ConflictException("comissão já repassada");
      },
    });
    await expect(service.reopen("t-1", "u-1", "tk-1", { reason: "teste" })).rejects.toThrow(/repassada/);
    expect(finance.reverseTicketIncome).not.toHaveBeenCalled();
    expect(products.reverseSales).not.toHaveBeenCalled();
    expect(club.releaseUsage).not.toHaveBeenCalled();
    expect(models.ticket.update).not.toHaveBeenCalled();
    expect(models.ticketAuditLog.create).not.toHaveBeenCalled();
  });

  it("a comissão é a primeira etapa", async () => {
    const { service, order } = build({ ticket: closed() });
    await service.reopen("t-1", "u-1", "tk-1", { reason: "teste" });
    expect(order[0]).toBe("commissions");
    expect(order).toEqual(expect.arrayContaining(["finance", "stock", "club"]));
  });

  it("só comanda FECHADA pode ser reaberta (aberta e cancelada dão 409, sem desfazer nada)", async () => {
    for (const status of ["OPEN", "CANCELED"]) {
      const { service, commissions, finance } = build({ ticket: ticket({ status }) });
      await expect(service.reopen("t-1", "u-1", "tk-1", { reason: "teste" })).rejects.toThrow(/fechada/);
      expect(commissions.reverseForTicket).not.toHaveBeenCalled();
      expect(finance.reverseTicketIncome).not.toHaveBeenCalled();
    }
  });

  it("comanda de outro negócio: 404 (tenantId no WHERE) e nada é desfeito", async () => {
    const { service, models, commissions } = build();
    models.ticket.findFirst.mockResolvedValue(null);
    await expect(service.reopen("t-1", "u-1", "de-outro", { reason: "teste" })).rejects.toThrow(NotFoundException);
    expect(models.ticket.findFirst.mock.calls[0][0].where).toEqual({ id: "de-outro", tenantId: "t-1" });
    expect(commissions.reverseForTicket).not.toHaveBeenCalled();
  });

  it("roda com o lock da comanda", async () => {
    const { service, tx } = build({ ticket: closed() });
    await service.reopen("t-1", "u-1", "tk-1", { reason: "teste" });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});

describe("TicketsService.history", () => {
  it("confere a comanda no negócio e lista o histórico com tenantId no WHERE, mais recente primeiro", async () => {
    const { service, models } = build();
    await service.history("t-1", "tk-1");
    expect(models.ticket.findFirst.mock.calls[0][0].where).toEqual({ id: "tk-1", tenantId: "t-1" });
    const call = models.ticketAuditLog.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: "t-1", ticketId: "tk-1" });
    expect(call.orderBy).toEqual({ createdAt: "desc" });
    expect(call.take).toBe(50);
  });

  it("comanda de outro negócio: 404 e o histórico nem é consultado", async () => {
    const { service, models } = build();
    models.ticket.findFirst.mockResolvedValue(null);
    await expect(service.history("t-1", "de-outro")).rejects.toThrow(NotFoundException);
    expect(models.ticketAuditLog.findMany).not.toHaveBeenCalled();
  });
});

// ───────── Rotas e validação ─────────
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Role } from "@marquo/database";
import { TicketsController } from "./tickets.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { SetTicketNoteDto, TicketReasonDto, UpdateTicketItemDto } from "./dto/ticket-dtos";

describe("TicketsController: quem pode o quê", () => {
  const proto = TicketsController.prototype;
  const handlerRoles = (name: keyof TicketsController) => Reflect.getMetadata(ROLES_KEY, proto[name]);

  it("a classe é de dono e recepção; reabrir e ver o histórico são SÓ do dono", () => {
    expect(Reflect.getMetadata(ROLES_KEY, TicketsController)).toEqual([Role.OWNER, Role.RECEPTIONIST]);
    expect(handlerRoles("reopen")).toEqual([Role.OWNER]);
    expect(handlerRoles("history")).toEqual([Role.OWNER]);
  });

  it("editar item, observação e estornar pagamento seguem a regra da classe (dono e recepção)", () => {
    for (const name of ["updateItem", "setNote", "removePayment"] as const) expect(handlerRoles(name)).toBeUndefined();
  });

  it("usa o tenantId e o userId do TOKEN", () => {
    const tickets = { updateItem: jest.fn(), setNote: jest.fn(), removePayment: jest.fn(), reopen: jest.fn(), history: jest.fn() };
    const c = new TicketsController(tickets as never);
    const user = { userId: "u-1", tenantId: "t-1", role: Role.OWNER };
    const dto = { reason: "teste" } as never;
    c.updateItem(user, "tk", "it", { quantity: 2 });
    c.setNote(user, "tk", { note: "x" });
    c.removePayment(user, "tk", "pay", dto);
    c.reopen(user, "tk", dto);
    c.history(user, "tk");
    expect(tickets.updateItem).toHaveBeenCalledWith("t-1", "u-1", "tk", "it", { quantity: 2 });
    expect(tickets.setNote).toHaveBeenCalledWith("t-1", "tk", { note: "x" });
    expect(tickets.removePayment).toHaveBeenCalledWith("t-1", "u-1", "tk", "pay", dto);
    expect(tickets.reopen).toHaveBeenCalledWith("t-1", "u-1", "tk", dto);
    expect(tickets.history).toHaveBeenCalledWith("t-1", "tk");
  });
});

const UUID = "11111111-1111-4111-8111-111111111111";
async function bad<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  return (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);
}

describe("DTOs de edição da comanda", () => {
  it("UpdateTicketItemDto: quantidade de 1 a 10.000, profissional UUID ou null", async () => {
    expect(await bad(UpdateTicketItemDto, { quantity: 2 })).toEqual([]);
    expect(await bad(UpdateTicketItemDto, { professionalId: UUID })).toEqual([]);
    expect(await bad(UpdateTicketItemDto, { professionalId: null })).toEqual([]);
    expect(await bad(UpdateTicketItemDto, { quantity: 0 })).toContain("quantity");
    expect(await bad(UpdateTicketItemDto, { quantity: 10_001 })).toContain("quantity");
    expect(await bad(UpdateTicketItemDto, { quantity: 1.5 })).toContain("quantity");
    expect(await bad(UpdateTicketItemDto, { professionalId: "abc" })).toContain("professionalId");
  });

  // Confiança no cliente: preço, tipo e serviço NUNCA mudam por aqui (preço de catálogo vem do servidor).
  it("UpdateTicketItemDto: recusa preço, tipo e serviço", async () => {
    for (const field of ["unitPriceCents", "kind", "serviceId", "description", "totalCents"]) {
      expect(await bad(UpdateTicketItemDto, { quantity: 2, [field]: 1 })).toContain(field);
    }
  });

  it("SetTicketNoteDto: texto até 1000, null limpa, ausente é recusado", async () => {
    expect(await bad(SetTicketNoteDto, { note: "ok" })).toEqual([]);
    expect(await bad(SetTicketNoteDto, { note: null })).toEqual([]);
    expect(await bad(SetTicketNoteDto, { note: "x".repeat(1001) })).toContain("note");
    expect(await bad(SetTicketNoteDto, {})).toContain("note");
  });

  it("TicketReasonDto: motivo obrigatório de 3 a 200 caracteres (só espaços não vale)", async () => {
    expect(await bad(TicketReasonDto, { reason: "digitei errado" })).toEqual([]);
    expect(await bad(TicketReasonDto, { reason: "ab" })).toContain("reason");
    expect(await bad(TicketReasonDto, { reason: "     " })).toContain("reason");
    expect(await bad(TicketReasonDto, { reason: "x".repeat(201) })).toContain("reason");
    expect(await bad(TicketReasonDto, {})).toContain("reason");
  });
});

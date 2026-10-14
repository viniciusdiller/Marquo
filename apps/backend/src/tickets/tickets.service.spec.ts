import { BadRequestException, ConflictException } from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { FinanceService } from "../finance/finance.service";

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: "tk-1",
    status: "OPEN",
    appointmentId: null,
    clientId: null,
    note: null,
    openedAt: new Date(),
    closedAt: null,
    discountCents: 0,
    items: [
      {
        id: "it-1",
        kind: "SERVICE",
        serviceId: "svc-1",
        productId: null,
        professionalId: "prof-1",
        description: "Corte",
        quantity: 1,
        unitPriceCents: 5000,
        professional: { user: { name: "Alex" } },
      },
    ],
    payments: [],
    client: null,
    appointment: null,
    ...over,
  };
}

function build(over: Record<string, unknown> = {}) {
  const models = {
    ticket: {
      findFirst: jest.fn().mockResolvedValue(ticket()),
      findMany: jest.fn().mockResolvedValue([ticket()]),
      create: jest.fn().mockResolvedValue(ticket()),
      update: jest.fn().mockImplementation(({ data }) => ticket({ ...data, items: ticket().items })),
    },
    ticketItem: { create: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    payment: { create: jest.fn() },
    service: { findFirst: jest.fn() },
    professional: { findFirst: jest.fn() },
  };
  // A transação enxerga os MESMOS modelos (mesmos jest.fn) + o lock por comanda, então os
  // testes configuram/inspecionam tudo por prisma.* e valem também dentro do lock.
  const prismaTx = { ...models, $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = {
    ...models,
    $transaction: jest.fn().mockImplementation(async (cb) => cb(prismaTx)),
    ...over,
  } as unknown as PrismaService;
  const products = { registerSale: jest.fn(), getOrThrow: jest.fn() } as unknown as ProductsService;
  const commissions = { computeForTicket: jest.fn() } as unknown as CommissionsService;
  const cash = { currentOpen: jest.fn().mockResolvedValue(null) } as unknown as CashRegisterService;
  const finance = { recordTicketIncome: jest.fn() } as unknown as FinanceService;
  return {
    service: new TicketsService(prisma, products, commissions, cash, finance),
    prisma,
    products,
    commissions,
    finance,
    prismaTx,
  };
}

describe("TicketsService", () => {
  it("serialize calcula subtotal, total com desconto e saldo", async () => {
    const { service, prisma } = build();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue(
      ticket({ discountCents: 1000, payments: [{ id: "p1", method: "PIX", amountCents: 2000, createdAt: new Date() }] }),
    );
    const result = await service.get("t-1", "tk-1");
    expect(result.subtotalCents).toBe(5000);
    expect(result.totalCents).toBe(4000);
    expect(result.paidCents).toBe(2000);
    expect(result.dueCents).toBe(2000);
  });

  it("addPayment recusa valor acima do saldo", async () => {
    const { service } = build();
    await expect(
      service.addPayment("t-1", "tk-1", { method: "PIX", amountCents: 6000 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("close recusa quando pagamento é insuficiente", async () => {
    const { service } = build();
    await expect(service.close("t-1", "u-1", "tk-1")).rejects.toThrow(BadRequestException);
  });

  it("close com pagamento completo gera comissão e fecha", async () => {
    const { service, prisma, commissions } = build();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue(
      ticket({ payments: [{ id: "p1", method: "CASH", amountCents: 5000, createdAt: new Date() }] }),
    );
    await service.close("t-1", "u-1", "tk-1");
    expect(commissions.computeForTicket).toHaveBeenCalledTimes(1);
  });

  it("addItem em comanda fechada é rejeitado", async () => {
    const { service, prisma } = build();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue(ticket({ status: "CLOSED" }));
    await expect(
      service.addItem("t-1", "tk-1", { kind: "CUSTOM", description: "Gorjeta", unitPriceCents: 1000 }),
    ).rejects.toThrow(ConflictException);
  });

  // Regressão (auditoria de confiança no cliente): unitPriceCents sobrescrevia o
  // preço do catálogo pra SERVICE/PRODUCT quando o cliente mandava o campo — um
  // RECEPTIONIST conseguia fechar uma comanda de R$150 registrando R$0,01. Esses
  // testes chamam o service direto (sem passar pelo DTO/ValidationPipe), então são a
  // última linha de defesa se o guard em addItem for removido no futuro.
  it("addItem rejeita unitPriceCents em item SERVICE — preço vem sempre do catálogo", async () => {
    const { service, prisma } = build();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id: "svc-1",
      priceCents: 15000,
      name: "Corte",
    });
    await expect(
      service.addItem("t-1", "tk-1", {
        kind: "SERVICE",
        serviceId: "svc-1",
        unitPriceCents: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("addItem rejeita unitPriceCents em item PRODUCT — preço vem sempre do catálogo", async () => {
    const { service, products } = build();
    (products.getOrThrow as jest.Mock).mockResolvedValue({
      id: "prod-1",
      priceCents: 8000,
      name: "Shampoo",
    });
    await expect(
      service.addItem("t-1", "tk-1", {
        kind: "PRODUCT",
        productId: "prod-1",
        unitPriceCents: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("addItem usa o preço do catálogo em SERVICE quando unitPriceCents não é enviado", async () => {
    const { service, prisma } = build();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id: "svc-1",
      priceCents: 15000,
      name: "Corte",
    });
    await service.addItem("t-1", "tk-1", { kind: "SERVICE", serviceId: "svc-1" });
    expect(prisma.ticketItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unitPriceCents: 15000 }),
      }),
    );
  });

  it("cancel recusa se há pagamento", async () => {
    const { service, prisma } = build();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue(
      ticket({ payments: [{ id: "p1", method: "PIX", amountCents: 100, createdAt: new Date() }] }),
    );
    await expect(service.cancel("t-1", "tk-1")).rejects.toThrow(BadRequestException);
  });

  // Regressão (race condition, dinheiro): requireOpen rodava FORA da transação, então dois
  // "fechar" concorrentes passavam juntos pela checagem e geravam receita/comissão/estoque em
  // dobro. Agora o status é relido sob o lock da comanda, dentro da transação.
  it("close relê o status sob lock: comanda já fechada por outra requisição não gera efeitos", async () => {
    const { service, prisma, commissions, finance, products } = build();
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue(
      ticket({ status: "CLOSED", payments: [{ id: "p1", method: "CASH", amountCents: 5000, createdAt: new Date() }] }),
    );

    await expect(service.close("t-1", "u-1", "tk-1")).rejects.toThrow(ConflictException);

    expect(commissions.computeForTicket).not.toHaveBeenCalled();
    expect(finance.recordTicketIncome).not.toHaveBeenCalled();
    expect(products.registerSale).not.toHaveBeenCalled();
  });

  it.each([
    ["addPayment", (s: TicketsService) => s.addPayment("t-1", "tk-1", { method: "PIX", amountCents: 100 })],
    ["cancel", (s: TicketsService) => s.cancel("t-1", "tk-1")],
    ["setDiscount", (s: TicketsService) => s.setDiscount("t-1", "tk-1", { discountCents: 0 })],
    ["removeItem", (s: TicketsService) => s.removeItem("t-1", "tk-1", "it-1")],
  ])("%s toma o lock da comanda antes de ler/escrever", async (_name, run) => {
    const { service, prismaTx, prisma } = build();
    (prisma.ticketItem.findFirst as jest.Mock).mockResolvedValue({ id: "it-1" });

    await run(service);

    expect(prismaTx.$executeRaw).toHaveBeenCalledTimes(1);
    const lockOrder = (prismaTx.$executeRaw as jest.Mock).mock.invocationCallOrder[0];
    const firstRead = (prisma.ticket.findFirst as jest.Mock).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(firstRead);
  });

  it("addPayment confere o saldo com a comanda lida DENTRO do lock (pagamento concorrente não estoura o total)", async () => {
    const { service, prisma } = build();
    // Outro caixa já pagou tudo entre a abertura da tela e este clique: o que vale é o estado
    // relido sob lock, não o que o front achava.
    (prisma.ticket.findFirst as jest.Mock).mockResolvedValue(
      ticket({ payments: [{ id: "p0", method: "PIX", amountCents: 5000, createdAt: new Date() }] }),
    );

    await expect(
      service.addPayment("t-1", "tk-1", { method: "PIX", amountCents: 100 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  describe("findOpen", () => {
    it("filtra estritamente por tenantId e status OPEN", async () => {
      const { service, prisma } = build();

      const result = await service.findOpen("tenant-A");

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-A", status: "OPEN" },
          orderBy: { openedAt: "asc" },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it("aplica skip e take quando informados na query de paginação", async () => {
      const { service, prisma } = build();

      await service.findOpen("tenant-A", { page: 3, pageSize: 15 });

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-A", status: "OPEN" },
          skip: 30,
          take: 15,
        }),
      );
    });
  });
});


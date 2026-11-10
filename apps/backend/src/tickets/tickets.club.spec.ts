import { BadRequestException } from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CommissionsService } from "../commissions/commissions.service";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { ClubService } from "../club/club.service";
import { FinanceService } from "../finance/finance.service";

// Clube de assinaturas na comanda: o SERVIDOR decide o que sai sem cobrança; o total, o pagamento exigido, a receita e a baixa
// do uso dependem disso. A comissão continua sobre o valor de tabela.

const NOW = new Date("2026-11-10T15:00:00.000Z");
const MEMBERSHIP = { id: "m-1", periodStart: new Date("2026-11-01T00:00:00.000Z") };

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
    clientId: "c-1",
    note: null,
    openedAt: NOW,
    closedAt: null,
    canceledAt: null,
    discountCents: 0,
    clubCoveredCents: 0,
    items: [item()],
    payments: [] as Array<{ id: string; method: string; amountCents: number; createdAt: Date }>,
    client: { id: "c-1", name: "Rafael", phone: "11999990000" },
    appointment: null,
    ...over,
  };
}

function build(opts: { open?: ReturnType<typeof ticket>; coverage?: { coveredCents: number; lines: Array<{ itemId: string; units: number; coveredCents: number }> } } = {}) {
  const open = opts.open ?? ticket();
  const coverage = { coveredCents: 0, lines: [], ...opts.coverage, membership: opts.coverage && opts.coverage.coveredCents > 0 ? MEMBERSHIP : null };
  const models = {
    ticket: {
      findFirst: jest.fn().mockResolvedValue(open),
      findMany: jest.fn().mockResolvedValue([open]),
      update: jest.fn().mockImplementation(({ data }) => ({ ...open, ...data, items: open.items })),
    },
    payment: { create: jest.fn() },
  };
  const tx = { ...models, $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = {
    ...models,
    $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  const commissions = { computeForTicket: jest.fn() };
  const finance = { recordTicketIncome: jest.fn() };
  const club = {
    isActive: jest.fn().mockResolvedValue(true),
    coverageForTicket: jest.fn().mockResolvedValue(coverage),
    recordUsage: jest.fn(),
  };
  const service = new TicketsService(
    prisma,
    { registerSale: jest.fn() } as unknown as ProductsService,
    commissions as unknown as CommissionsService,
    { currentOpen: jest.fn().mockResolvedValue(null) } as unknown as CashRegisterService,
    finance as unknown as FinanceService,
    club as unknown as ClubService,
  );
  return { service, tx, models, commissions, finance, club };
}

const paid = (amountCents: number) => [{ id: "p-1", method: "CASH", amountCents, createdAt: NOW }];

describe("TicketsService: clube de assinaturas na comanda", () => {
  describe("get / listagem", () => {
    it("comanda aberta de membro mostra o abatimento do clube e o total já descontado", async () => {
      const { service } = build({ coverage: { coveredCents: 5000, lines: [{ itemId: "it-1", units: 1, coveredCents: 5000 }] } });
      const r = await service.get("t-1", "tk-1");
      expect(r.subtotalCents).toBe(5000);
      expect(r.clubCoveredCents).toBe(5000);
      expect(r.totalCents).toBe(0);
      expect(r.dueCents).toBe(0);
      expect(r.items[0]).toMatchObject({ clubCoveredUnits: 1, clubCoveredCents: 5000 });
    });

    it("o desconto manual e o clube se somam, sem passar de zero", async () => {
      const { service } = build({
        open: ticket({ discountCents: 3000 }),
        coverage: { coveredCents: 5000, lines: [{ itemId: "it-1", units: 1, coveredCents: 5000 }] },
      });
      const r = await service.get("t-1", "tk-1");
      expect(r.totalCents).toBe(0);
    });

    it("cliente fora do clube: nada muda", async () => {
      const { service } = build();
      const r = await service.get("t-1", "tk-1");
      expect(r.clubCoveredCents).toBe(0);
      expect(r.totalCents).toBe(5000);
    });

    it("comanda FECHADA usa o valor GRAVADO (nunca recalcula) e o que foi de fato baixado em cada item", async () => {
      const closed = ticket({
        status: "CLOSED",
        clubCoveredCents: 5000,
        items: [item({ clubUsage: { units: 1, coveredCents: 5000 } })],
      });
      const { service, club } = build({ open: closed });
      const r = await service.get("t-1", "tk-1");
      expect(club.coverageForTicket).not.toHaveBeenCalled();
      expect(r.clubCoveredCents).toBe(5000);
      expect(r.totalCents).toBe(0);
      expect(r.items[0]).toMatchObject({ clubCoveredUnits: 1, clubCoveredCents: 5000 });
    });

    it("a listagem confere o clube UMA vez e não repete a consulta por comanda", async () => {
      const { service, club } = build();
      await service.findOpen("t-1");
      expect(club.isActive).toHaveBeenCalledTimes(1);
      expect(club.coverageForTicket.mock.calls[0][3]).toEqual({ assumeActive: true });
    });

    it("clube inativo na listagem: nenhuma consulta de cobertura", async () => {
      const { service, club } = build();
      club.isActive.mockResolvedValue(false);
      await service.findOpen("t-1");
      expect(club.coverageForTicket).not.toHaveBeenCalled();
    });
  });

  describe("pagamento e fechamento", () => {
    it("o pagamento exigido já considera o clube: pagar só a diferença", async () => {
      const { service, models } = build({
        open: ticket({ items: [item({ unitPriceCents: 5000 }), item({ id: "it-2", serviceId: "svc-2", unitPriceCents: 3000, createdAt: new Date(NOW.getTime() + 1) })] }),
        coverage: { coveredCents: 5000, lines: [{ itemId: "it-1", units: 1, coveredCents: 5000 }] },
      });
      // total = 8000 − 5000 = 3000: pagar 3000 passa, 3001 estoura.
      await expect(service.addPayment("t-1", "tk-1", { method: "CASH", amountCents: 3001 } as never)).rejects.toThrow(BadRequestException);
      await service.addPayment("t-1", "tk-1", { method: "CASH", amountCents: 3000 } as never);
      expect(models.payment.create).toHaveBeenCalledTimes(1);
    });

    it("fecha comanda 100% coberta SEM pagamento, baixa o uso e grava o valor coberto", async () => {
      const coverage = { coveredCents: 5000, lines: [{ itemId: "it-1", units: 1, coveredCents: 5000 }] };
      const { service, club, models, finance } = build({ coverage });

      await service.close("t-1", "u-1", "tk-1");

      // com lock na adesão (fechamentos simultâneos do mesmo membro)
      expect(club.coverageForTicket.mock.calls[0][3]).toEqual({ lock: true });
      expect(club.recordUsage).toHaveBeenCalledWith(expect.anything(), "t-1", "tk-1", expect.objectContaining({ coveredCents: 5000 }));
      expect(models.ticket.update.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", clubCoveredCents: 5000 });
      expect(finance.recordTicketIncome).toHaveBeenCalledWith(expect.anything(), "t-1", "u-1", { id: "tk-1", totalCents: 0 });
    });

    it("fecha com pagamento parcial quando o clube cobre parte; a receita é só o que foi pago de fato", async () => {
      const { service, finance } = build({
        open: ticket({
          items: [item({ unitPriceCents: 5000 }), item({ id: "it-2", serviceId: "svc-2", unitPriceCents: 3000, createdAt: new Date(NOW.getTime() + 1) })],
          payments: paid(3000),
        }),
        coverage: { coveredCents: 5000, lines: [{ itemId: "it-1", units: 1, coveredCents: 5000 }] },
      });
      await service.close("t-1", "u-1", "tk-1");
      expect(finance.recordTicketIncome).toHaveBeenCalledWith(expect.anything(), "t-1", "u-1", { id: "tk-1", totalCents: 3000 });
    });

    // Corrida: a cobertura é recalculada DENTRO do lock no fechamento. Se o saldo acabou desde que o operador viu o total, o
    // fechamento exige a diferença em vez de fechar com um desconto que não existe mais.
    it("se o saldo do clube acabou antes do fechamento, exige o pagamento que faltou e não baixa uso nenhum", async () => {
      const { service, club, models } = build(); // cobertura 0 no fechamento
      await expect(service.close("t-1", "u-1", "tk-1")).rejects.toThrow(/Faltam 5000/);
      expect(club.recordUsage).not.toHaveBeenCalled();
      expect(models.ticket.update).not.toHaveBeenCalled();
    });

    it("a comissão continua sobre o valor de TABELA: os itens vão para o cálculo com o preço cheio", async () => {
      const coverage = { coveredCents: 5000, lines: [{ itemId: "it-1", units: 1, coveredCents: 5000 }] };
      const { service, commissions } = build({ coverage });
      await service.close("t-1", "u-1", "tk-1");
      expect(commissions.computeForTicket.mock.calls[0][3]).toEqual([
        expect.objectContaining({ id: "it-1", unitPriceCents: 5000, quantity: 1 }),
      ]);
    });

    it("sem itens continua sendo recusado", async () => {
      const { service } = build({ open: ticket({ items: [] }) });
      await expect(service.close("t-1", "u-1", "tk-1")).rejects.toThrow(BadRequestException);
    });
  });
});

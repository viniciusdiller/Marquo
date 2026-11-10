import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClubService } from "./club.service";
import { ClubAccessService } from "./club-access.service";
import { FinanceService } from "../finance/finance.service";
import { PrismaService } from "../prisma/prisma.service";

const NOW = new Date("2026-11-10T15:00:00.000Z");
const DAY = 86_400_000;
const SERVICE_A = "11111111-1111-4111-8111-111111111111";
const SERVICE_B = "22222222-2222-4222-8222-222222222222";

function membershipRow(over: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    status: "ACTIVE",
    usesPerMonth: 4,
    priceCents: 12000,
    periodStart: new Date(NOW.getTime() - 25 * DAY),
    periodEnd: new Date(NOW.getTime() + 5 * DAY),
    canceledAt: null,
    client: { id: "c-1", name: "Rafael", phone: "11999990000" },
    plan: { name: "Clube Corte", priceCents: 12000 },
    ...over,
  };
}

function build(opts: { planAllows?: boolean; enabled?: boolean } = {}) {
  const access = {
    planAllowsClub: jest.fn().mockResolvedValue(opts.planAllows ?? true),
    overview: jest.fn().mockResolvedValue({ planAllowsClub: opts.planAllows ?? true, enabled: opts.enabled ?? true }),
    isActive: jest.fn().mockResolvedValue((opts.planAllows ?? true) && (opts.enabled ?? true)),
    assertActive: jest.fn().mockImplementation(async () => {
      if (!(opts.planAllows ?? true)) throw new ForbiddenException("plano");
      if (!(opts.enabled ?? true)) throw new ForbiddenException("desligado");
    }),
  } as unknown as ClubAccessService;
  const finance = { recordClubIncome: jest.fn().mockResolvedValue(undefined) } as unknown as FinanceService;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    client: { findFirst: jest.fn().mockResolvedValue({ id: "c-1", name: "Rafael" }) },
    clubPlan: {
      findFirst: jest.fn().mockResolvedValue({ id: "p-1", name: "Clube Corte", priceCents: 12000, usesPerMonth: 4 }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: "p-1" }),
    },
    clubPlanService: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    service: { findMany: jest.fn().mockResolvedValue([{ id: SERVICE_A }, { id: SERVICE_B }]) },
    clubMembership: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "m-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    clubUsage: { groupBy: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
    tenant: { update: jest.fn().mockResolvedValue({}) },
    clubPlan: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "p-1",
          name: "Clube Corte",
          description: null,
          priceCents: 12000,
          usesPerMonth: 4,
          isActive: true,
          services: [{ service: { id: SERVICE_A, name: "Corte" } }],
          _count: { memberships: 2 },
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    clubMembership: {
      findFirst: jest.fn().mockResolvedValue(membershipRow()),
      findMany: jest.fn().mockResolvedValue([membershipRow()]),
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    clubUsage: { groupBy: jest.fn().mockResolvedValue([]), aggregate: jest.fn(), createMany: jest.fn() },
  };
  const service = new ClubService(prisma as unknown as PrismaService, access, finance);
  return { service, prisma, tx, access, finance };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe("ClubService: ligar e desligar", () => {
  it("ligar exige que o plano inclua o clube", async () => {
    const { service, prisma } = build({ planAllows: false });
    await expect(service.setEnabled("t-1", true)).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("desligar sempre pode, mesmo em plano sem clube (downgrade)", async () => {
    const { service, prisma } = build({ planAllows: false });
    await service.setEnabled("t-1", false);
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: "t-1" }, data: { clubEnabled: false } });
  });

  it("liga no negócio do token", async () => {
    const { service, prisma } = build();
    await service.setEnabled("t-1", true);
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: "t-1" }, data: { clubEnabled: true } });
  });
});

describe("ClubService: pacotes", () => {
  it("lista só os pacotes do negócio (tenantId no WHERE) com serviços e adesões ativas", async () => {
    const { service, prisma } = build();
    const plans = await service.listPlans("t-1");
    expect(prisma.clubPlan.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t-1" });
    expect(plans[0]).toMatchObject({ name: "Clube Corte", activeMembers: 2, services: [{ id: SERVICE_A, name: "Corte" }] });
  });

  it("criar exige clube ativo (plano + ligado)", async () => {
    const { service, tx } = build({ enabled: false });
    await expect(service.createPlan("t-1", { name: "X", priceCents: 5000, usesPerMonth: 2, serviceIds: [SERVICE_A] })).rejects.toThrow(ForbiddenException);
    expect(tx.clubPlan.create).not.toHaveBeenCalled();
  });

  it("cria o pacote e vincula os serviços na mesma transação", async () => {
    const { service, tx } = build();
    await service.createPlan("t-1", { name: "Clube Corte", priceCents: 12000, usesPerMonth: 4, serviceIds: [SERVICE_A, SERVICE_B] });
    expect(tx.clubPlan.create.mock.calls[0][0].data).toMatchObject({ tenantId: "t-1", name: "Clube Corte", priceCents: 12000, usesPerMonth: 4 });
    expect(tx.clubPlanService.createMany).toHaveBeenCalledWith({
      data: [
        { clubPlanId: "p-1", serviceId: SERVICE_A },
        { clubPlanId: "p-1", serviceId: SERVICE_B },
      ],
    });
  });

  // Segurança (IDOR): serviço de OUTRO negócio (ou inativo) não entra, e nada é criado.
  it("serviço de outro negócio dá 404 e não cria o pacote", async () => {
    const { service, tx } = build();
    tx.service.findMany.mockResolvedValue([{ id: SERVICE_A }]);
    await expect(service.createPlan("t-1", { name: "X", priceCents: 5000, usesPerMonth: 2, serviceIds: [SERVICE_A, SERVICE_B] })).rejects.toThrow(NotFoundException);
    expect(tx.clubPlan.create).not.toHaveBeenCalled();
    expect(tx.service.findMany.mock.calls[0][0].where).toEqual({ id: { in: [SERVICE_A, SERVICE_B] }, tenantId: "t-1", isActive: true });
  });

  it("recusa passar do teto de pacotes por negócio", async () => {
    const { service, tx } = build();
    tx.clubPlan.count.mockResolvedValue(30);
    await expect(service.createPlan("t-1", { name: "X", priceCents: 5000, usesPerMonth: 2, serviceIds: [SERVICE_A] })).rejects.toThrow(ConflictException);
  });

  it("editar leva tenantId no WHERE da escrita; pacote de outro negócio é 404", async () => {
    const { service, prisma } = build();
    await service.updatePlan("t-1", "p-1", { name: "Novo nome", isActive: false });
    expect(prisma.clubPlan.updateMany.mock.calls[0][0]).toEqual({ where: { id: "p-1", tenantId: "t-1" }, data: { name: "Novo nome", isActive: false } });

    prisma.clubPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updatePlan("t-1", "de-outro", { name: "x" })).rejects.toThrow(NotFoundException);
  });

  it("descrição em branco limpa o campo (grava null)", async () => {
    const { service, prisma } = build();
    await service.updatePlan("t-1", "p-1", { description: "" });
    expect(prisma.clubPlan.updateMany.mock.calls[0][0].data).toEqual({ description: null });
  });
});

describe("ClubService.enroll", () => {
  const dto = { clientId: "c-1", planId: "p-1" };

  it("inscreve o cliente, abre o 1º mês e registra a receita da mensalidade", async () => {
    const { service, tx, finance } = build();
    await service.enroll("t-1", "u-1", dto);

    const data = tx.clubMembership.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: "t-1", clubPlanId: "p-1", clientId: "c-1", usesPerMonth: 4, priceCents: 12000 });
    expect(data.periodStart).toEqual(NOW);
    expect(data.periodEnd.getTime()).toBeGreaterThan(NOW.getTime() + 27 * DAY);
    expect(data.periodEnd.getTime()).toBeLessThan(NOW.getTime() + 32 * DAY);
    expect(finance.recordClubIncome).toHaveBeenCalledWith(tx, "t-1", "u-1", expect.objectContaining({ amountCents: 12000 }));
  });

  it("cliente e pacote são conferidos NO negócio (tenantId no WHERE), com lock por cliente", async () => {
    const { service, tx } = build();
    await service.enroll("t-1", "u-1", dto);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.client.findFirst.mock.calls[0][0].where).toEqual({ id: "c-1", tenantId: "t-1" });
    expect(tx.clubPlan.findFirst.mock.calls[0][0].where).toEqual({ id: "p-1", tenantId: "t-1", isActive: true });
  });

  it("cliente de outro negócio: 404 e nada é criado nem cobrado", async () => {
    const { service, tx, finance } = build();
    tx.client.findFirst.mockResolvedValue(null);
    await expect(service.enroll("t-1", "u-1", dto)).rejects.toThrow(NotFoundException);
    expect(tx.clubMembership.create).not.toHaveBeenCalled();
    expect(finance.recordClubIncome).not.toHaveBeenCalled();
  });

  it("pacote desativado ou de outro negócio: 404", async () => {
    const { service, tx } = build();
    tx.clubPlan.findFirst.mockResolvedValue(null);
    await expect(service.enroll("t-1", "u-1", dto)).rejects.toThrow(NotFoundException);
  });

  it("cliente que já está no clube: 409, sem segunda adesão nem receita em dobro", async () => {
    const { service, tx, finance } = build();
    tx.clubMembership.findFirst.mockResolvedValue({ id: "m-0" });
    await expect(service.enroll("t-1", "u-1", dto)).rejects.toThrow(ConflictException);
    expect(tx.clubMembership.create).not.toHaveBeenCalled();
    expect(finance.recordClubIncome).not.toHaveBeenCalled();
  });

  it("clube desligado ou plano sem clube: 403 antes de qualquer escrita", async () => {
    const { service, prisma } = build({ planAllows: false });
    await expect(service.enroll("t-1", "u-1", dto)).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("ClubService.renew", () => {
  it("renova perto do fim do mês pago: mês novo a partir de agora, preço ATUAL do pacote, e lança a receita", async () => {
    const { service, tx, finance } = build();
    tx.clubMembership.findFirst.mockResolvedValue({
      id: "m-1",
      periodEnd: new Date(NOW.getTime() + 3 * DAY),
      plan: { name: "Clube Corte", priceCents: 15000 },
      client: { name: "Rafael" },
    });
    await service.renew("t-1", "u-1", "m-1");

    const call = tx.clubMembership.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "m-1" });
    expect(call.data.periodStart).toEqual(NOW);
    expect(call.data.priceCents).toBe(15000);
    expect(finance.recordClubIncome).toHaveBeenCalledWith(tx, "t-1", "u-1", expect.objectContaining({ amountCents: 15000 }));
  });

  it("renova também depois de vencida", async () => {
    const { service, tx } = build();
    tx.clubMembership.findFirst.mockResolvedValue({
      id: "m-1",
      periodEnd: new Date(NOW.getTime() - 10 * DAY),
      plan: { name: "Clube Corte", priceCents: 12000 },
      client: { name: "Rafael" },
    });
    await expect(service.renew("t-1", "u-1", "m-1")).resolves.toBeDefined();
  });

  // Segundo clique / mês ainda em andamento: não lança a receita duas vezes nem descarta os usos que sobraram.
  it("mês ainda em andamento: 409, sem alterar nada e sem receita", async () => {
    const { service, tx, finance } = build();
    tx.clubMembership.findFirst.mockResolvedValue({
      id: "m-1",
      periodEnd: new Date(NOW.getTime() + 20 * DAY),
      plan: { name: "Clube Corte", priceCents: 12000 },
      client: { name: "Rafael" },
    });
    await expect(service.renew("t-1", "u-1", "m-1")).rejects.toThrow(ConflictException);
    expect(tx.clubMembership.update).not.toHaveBeenCalled();
    expect(finance.recordClubIncome).not.toHaveBeenCalled();
  });

  it("adesão de outro negócio, cancelada ou inexistente: 404 (busca com tenantId e status ACTIVE no WHERE)", async () => {
    const { service, tx } = build();
    tx.clubMembership.findFirst.mockResolvedValue(null);
    await expect(service.renew("t-1", "u-1", "de-outro")).rejects.toThrow(NotFoundException);
    expect(tx.clubMembership.findFirst.mock.calls[0][0].where).toEqual({ id: "de-outro", tenantId: "t-1", status: "ACTIVE" });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});

describe("ClubService.cancel", () => {
  it("cancela com tenantId e status ACTIVE no WHERE da escrita", async () => {
    const { service, prisma } = build();
    await service.cancel("t-1", "m-1");
    const call = prisma.clubMembership.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "m-1", tenantId: "t-1", status: "ACTIVE" });
    expect(call.data.status).toBe("CANCELED");
  });

  it("adesão de outro negócio (ou já cancelada): 404", async () => {
    const { service, prisma } = build();
    prisma.clubMembership.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel("t-1", "x")).rejects.toThrow(NotFoundException);
  });
});

describe("ClubService.listMembers", () => {
  it("mostra usos do mês pago atual, saldo e estado", async () => {
    const { service, prisma } = build();
    const row = membershipRow();
    prisma.clubMembership.findMany.mockResolvedValue([row]);
    prisma.clubUsage.groupBy.mockResolvedValue([{ membershipId: "m-1", periodStart: row.periodStart, _sum: { units: 3 } }]);

    const page = await service.listMembers("t-1", {});
    expect(page.items[0]).toMatchObject({ state: "ACTIVE", usesPerMonth: 4, usesInPeriod: 3, usesRemaining: 1, planName: "Clube Corte" });
    expect(prisma.clubMembership.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t-1" });
  });

  it("uso de um mês pago ANTERIOR não conta (renovar zera)", async () => {
    const { service, prisma } = build();
    prisma.clubUsage.groupBy.mockResolvedValue([{ membershipId: "m-1", periodStart: new Date(NOW.getTime() - 90 * DAY), _sum: { units: 4 } }]);
    const page = await service.listMembers("t-1", {});
    expect(page.items[0].usesInPeriod).toBe(0);
    expect(page.items[0].usesRemaining).toBe(4);
  });

  it("mês pago que acabou aparece como EXPIRED; cancelada como CANCELED", async () => {
    const { service, prisma } = build();
    prisma.clubMembership.findMany.mockResolvedValue([
      membershipRow({ id: "a", periodEnd: new Date(NOW.getTime() - DAY) }),
      membershipRow({ id: "b", status: "CANCELED" }),
    ]);
    const page = await service.listMembers("t-1", {});
    expect(page.items.map((m) => m.state)).toEqual(["EXPIRED", "CANCELED"]);
  });

  // O servidor decide quando dá para renovar (a tela só mostra o botão): perto do fim do mês pago ou depois dele.
  it("canRenew: falso no meio do mês, verdadeiro a ≤ 7 dias do fim e depois de vencido, falso se cancelada", async () => {
    const { service, prisma } = build();
    prisma.clubMembership.findMany.mockResolvedValue([
      membershipRow({ id: "meio", periodEnd: new Date(NOW.getTime() + 20 * DAY) }),
      membershipRow({ id: "perto", periodEnd: new Date(NOW.getTime() + 6 * DAY) }),
      membershipRow({ id: "vencida", periodEnd: new Date(NOW.getTime() - DAY) }),
      membershipRow({ id: "cancelada", status: "CANCELED", periodEnd: new Date(NOW.getTime() - DAY) }),
    ]);
    const page = await service.listMembers("t-1", {});
    expect(page.items.map((m) => [m.id, m.canRenew])).toEqual([
      ["meio", false],
      ["perto", true],
      ["vencida", true],
      ["cancelada", false],
    ]);
  });

  it("filtra por estado, sempre dentro do negócio", async () => {
    const { service, prisma } = build();
    await service.listMembers("t-1", { state: "EXPIRED" as never });
    expect(prisma.clubMembership.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1", status: "ACTIVE", periodEnd: { lte: NOW } });
    await service.listMembers("t-1", { state: "ACTIVE" as never });
    expect(prisma.clubMembership.findMany.mock.calls[1][0].where).toMatchObject({ tenantId: "t-1", status: "ACTIVE", periodEnd: { gt: NOW } });
  });

  it("é paginado (skip/take)", async () => {
    const { service, prisma } = build();
    await service.listMembers("t-1", { page: 3, pageSize: 5 });
    expect(prisma.clubMembership.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 5 });
  });
});

describe("ClubService.coverageForTicket", () => {
  const items = [{ id: "i1", kind: "SERVICE", serviceId: SERVICE_A, quantity: 1, unitPriceCents: 5000, createdAt: NOW }];

  function db(over: { membership?: unknown; used?: number } = {}) {
    return {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubMembership: {
        findFirst: jest.fn().mockResolvedValue(
          "membership" in over ? over.membership : { id: "m-1", periodStart: NOW, usesPerMonth: 4, plan: { services: [{ serviceId: SERVICE_A }] } },
        ),
      },
      clubUsage: { aggregate: jest.fn().mockResolvedValue({ _sum: { units: over.used ?? 0 } }) },
    };
  }

  it("cobre o serviço do pacote de quem tem adesão ativa e mês pago", async () => {
    const { service } = build();
    const r = await service.coverageForTicket(db() as never, "t-1", { clientId: "c-1", items });
    expect(r.coveredCents).toBe(5000);
    expect(r.membership?.id).toBe("m-1");
  });

  it("consulta a adesão do cliente DESTE negócio, ativa e dentro do mês pago", async () => {
    const { service } = build();
    const database = db();
    await service.coverageForTicket(database as never, "t-1", { clientId: "c-1", items });
    expect(database.clubMembership.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "t-1",
      clientId: "c-1",
      status: "ACTIVE",
      periodStart: { lte: NOW },
      periodEnd: { gt: NOW },
    });
  });

  it("desconta os usos já gastos neste mês pago", async () => {
    const { service } = build();
    const r = await service.coverageForTicket(db({ used: 4 }) as never, "t-1", { clientId: "c-1", items });
    expect(r.coveredCents).toBe(0);
  });

  it("sem cliente, sem itens, sem adesão ou clube inativo: nada coberto", async () => {
    const { service } = build();
    expect((await service.coverageForTicket(db() as never, "t-1", { clientId: null, items })).coveredCents).toBe(0);
    expect((await service.coverageForTicket(db() as never, "t-1", { clientId: "c-1", items: [] })).coveredCents).toBe(0);
    expect((await service.coverageForTicket(db({ membership: null }) as never, "t-1", { clientId: "c-1", items })).coveredCents).toBe(0);
    const off = build({ enabled: false });
    expect((await off.service.coverageForTicket(db() as never, "t-1", { clientId: "c-1", items })).coveredCents).toBe(0);
  });

  it("no fechamento trava a adesão (dois fechamentos do mesmo membro não gastam o mesmo uso)", async () => {
    const { service } = build();
    const database = db();
    await service.coverageForTicket(database as never, "t-1", { clientId: "c-1", items }, { lock: true });
    expect(database.$executeRaw).toHaveBeenCalledTimes(1);
    await service.coverageForTicket(database as never, "t-1", { clientId: "c-1", items });
    expect(database.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("recordUsage grava uma linha por item coberto, ligada ao mês pago", async () => {
    const { service } = build();
    const tx = { clubUsage: { createMany: jest.fn() } };
    await service.recordUsage(tx as never, "t-1", "tk-1", {
      coveredCents: 5000,
      lines: [{ itemId: "i1", units: 1, coveredCents: 5000 }],
      membership: { id: "m-1", periodStart: NOW },
    });
    expect(tx.clubUsage.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: "t-1", membershipId: "m-1", ticketId: "tk-1", ticketItemId: "i1", periodStart: NOW, units: 1, coveredCents: 5000 }],
    });
  });

  it("recordUsage sem cobertura não grava nada", async () => {
    const { service } = build();
    const tx = { clubUsage: { createMany: jest.fn() } };
    await service.recordUsage(tx as never, "t-1", "tk-1", { coveredCents: 0, lines: [], membership: null });
    expect(tx.clubUsage.createMany).not.toHaveBeenCalled();
  });
});

describe("ClubService.releaseUsage (reabertura de comanda)", () => {
  it("devolve os usos que o fechamento baixou, só desta comanda e deste negócio", async () => {
    const { service } = build();
    const tx = { clubUsage: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    expect(await service.releaseUsage(tx as never, "t-1", "tk-1")).toEqual({ count: 2 });
    expect(tx.clubUsage.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t-1", ticketId: "tk-1" } });
  });
});

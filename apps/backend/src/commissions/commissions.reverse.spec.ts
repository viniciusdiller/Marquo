import { ConflictException } from "@nestjs/common";
import { CommissionsService } from "./commissions.service";
import { PrismaService } from "../prisma/prisma.service";

// Reabrir comanda apaga as comissões do fechamento. O saldo a repassar é DERIVADO (comissões − repasses): se já foi repassado mais do
// que sobraria sem esta comanda, o saldo ficaria negativo, então recusa.

function build(opts: {
  entries: Array<{ professionalId: string; amountCents: number; name: string }>;
  accrued: Record<string, number>; // total de comissões do profissional (incluindo esta comanda)
  paid: Record<string, number>; // total já repassado
}) {
  const locks: string[] = [];
  const tx = {
    $executeRaw: jest.fn().mockImplementation(async (_strings: TemplateStringsArray, key: string) => {
      locks.push(key);
      return 1;
    }),
    commissionEntry: {
      findMany: jest.fn().mockResolvedValue(opts.entries.map((e) => ({ professionalId: e.professionalId, amountCents: e.amountCents, professional: { user: { name: e.name } } }))),
      aggregate: jest.fn().mockImplementation(async ({ where }) => ({ _sum: { amountCents: opts.accrued[where.professionalId] ?? 0 } })),
      deleteMany: jest.fn().mockResolvedValue({ count: opts.entries.length }),
    },
    commissionPayout: {
      aggregate: jest.fn().mockImplementation(async ({ where }) => ({ _sum: { amountCents: opts.paid[where.professionalId] ?? 0 } })),
    },
  };
  return { tx, locks, service: new CommissionsService({} as unknown as PrismaService) };
}

describe("CommissionsService.reverseForTicket", () => {
  it("apaga as comissões da comanda quando nada impede", async () => {
    const { service, tx } = build({
      entries: [{ professionalId: "p1", amountCents: 2000, name: "Alex" }],
      accrued: { p1: 5000 },
      paid: { p1: 3000 }, // 5000 − 2000 = 3000 ≥ 3000 pago: ok
    });
    const result = await service.reverseForTicket(tx as never, "t-1", "tk-1");
    expect(result.count).toBe(1);
    expect(tx.commissionEntry.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t-1", ticketId: "tk-1" } });
  });

  it("recusa se tirar a comissão deixaria o saldo NEGATIVO (já foi repassado) e não apaga nada", async () => {
    const { service, tx } = build({
      entries: [{ professionalId: "p1", amountCents: 2000, name: "Alex" }],
      accrued: { p1: 5000 },
      paid: { p1: 4000 }, // 5000 − 2000 = 3000 < 4000 pago
    });
    await expect(service.reverseForTicket(tx as never, "t-1", "tk-1")).rejects.toThrow(ConflictException);
    await expect(service.reverseForTicket(tx as never, "t-1", "tk-1")).rejects.toThrow(/Alex.*já foi repassada/);
    expect(tx.commissionEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("confere CADA profissional: basta um com saldo negativo para recusar tudo", async () => {
    const { service, tx } = build({
      entries: [
        { professionalId: "p1", amountCents: 1000, name: "Alex" },
        { professionalId: "p2", amountCents: 1000, name: "Bruna" },
      ],
      accrued: { p1: 5000, p2: 1500 },
      paid: { p1: 0, p2: 1000 }, // p2: 1500 − 1000 = 500 < 1000
    });
    await expect(service.reverseForTicket(tx as never, "t-1", "tk-1")).rejects.toThrow(/Bruna/);
    expect(tx.commissionEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("soma várias comissões do MESMO profissional na comanda", async () => {
    const { service, tx } = build({
      entries: [
        { professionalId: "p1", amountCents: 1500, name: "Alex" },
        { professionalId: "p1", amountCents: 1500, name: "Alex" },
      ],
      accrued: { p1: 3000 },
      paid: { p1: 1 }, // 3000 − 3000 = 0 < 1
    });
    await expect(service.reverseForTicket(tx as never, "t-1", "tk-1")).rejects.toThrow(ConflictException);
  });

  // O lock é o MESMO do repasse (commission-payout:<id>): um repasse simultâneo não passa por baixo da conferência.
  it("trava cada profissional com a mesma chave do repasse, em ordem fixa (sem deadlock)", async () => {
    const { service, tx, locks } = build({
      entries: [
        { professionalId: "p2", amountCents: 100, name: "Bruna" },
        { professionalId: "p1", amountCents: 100, name: "Alex" },
      ],
      accrued: { p1: 1000, p2: 1000 },
      paid: {},
    });
    await service.reverseForTicket(tx as never, "t-1", "tk-1");
    expect(locks).toEqual(["commission-payout:p1", "commission-payout:p2"]);
  });

  it("filtra tudo por tenantId", async () => {
    const { service, tx } = build({ entries: [{ professionalId: "p1", amountCents: 100, name: "Alex" }], accrued: { p1: 1000 }, paid: {} });
    await service.reverseForTicket(tx as never, "t-1", "tk-1");
    expect(tx.commissionEntry.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t-1", ticketId: "tk-1" });
    expect(tx.commissionEntry.aggregate.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1" });
    expect(tx.commissionPayout.aggregate.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1" });
  });

  it("comanda sem comissão: nada a desfazer e nenhum lock", async () => {
    const { service, tx, locks } = build({ entries: [], accrued: {}, paid: {} });
    expect(await service.reverseForTicket(tx as never, "t-1", "tk-1")).toEqual({ count: 0 });
    expect(locks).toEqual([]);
    expect(tx.commissionEntry.deleteMany).not.toHaveBeenCalled();
  });
});

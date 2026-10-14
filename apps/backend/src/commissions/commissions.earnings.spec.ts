import { BadRequestException } from "@nestjs/common";
import { Role } from "@marquo/database";
import { CommissionsService } from "./commissions.service";
import { PrismaService } from "../prisma/prisma.service";

const FROM = "2026-10-01T00:00:00Z";
const TO = "2026-10-31T23:59:59Z";

type Mocks = {
  gross?: Array<{ professionalId: string; gross: bigint; tickets: bigint }>;
  discounted?: unknown[];
  period?: unknown[];
  accrued?: unknown[];
  paid?: unknown[];
  professionals?: unknown[];
};

function build(m: Mocks = {}) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(m.gross ?? []),
    ticket: { findMany: jest.fn().mockResolvedValue(m.discounted ?? []) },
    // 1ª chamada = comissões do período, 2ª = acumulado de todo o histórico (ordem do Promise.all).
    commissionEntry: {
      groupBy: jest
        .fn()
        .mockResolvedValueOnce(m.period ?? [])
        .mockResolvedValueOnce(m.accrued ?? []),
    },
    commissionPayout: { groupBy: jest.fn().mockResolvedValue(m.paid ?? []) },
    professional: { findMany: jest.fn().mockResolvedValue(m.professionals ?? []) },
  };
  return { prisma, svc: new CommissionsService(prisma as unknown as PrismaService) };
}

const sum = (cents: number | null) => ({ _sum: { amountCents: cents } });
const pro = (id: string, name: string, isActive = true) => ({ id, isActive, user: { name } });

describe("CommissionsService.earnings", () => {
  it("calcula bruto, desconto rateado, líquido, repasse, sobra da casa e saldo acumulado", async () => {
    const { svc } = build({
      gross: [
        { professionalId: "p1", gross: 10000n, tickets: 2n },
        { professionalId: "p2", gross: 4000n, tickets: 1n },
      ],
      // 1 comanda com R$ 10 de desconto: p1 tinha R$ 60 e p2 R$ 40 → 6,00 e 4,00 de desconto
      discounted: [
        {
          discountCents: 1000,
          items: [
            { professionalId: "p1", unitPriceCents: 6000, quantity: 1 },
            { professionalId: "p2", unitPriceCents: 2000, quantity: 2 },
          ],
        },
      ],
      period: [{ professionalId: "p1", ...sum(3000) }, { professionalId: "p2", ...sum(800) }],
      accrued: [{ professionalId: "p1", ...sum(5000) }, { professionalId: "p2", ...sum(800) }],
      paid: [{ professionalId: "p1", ...sum(2000) }],
      professionals: [pro("p1", "Alex"), pro("p2", "Bruna")],
    });

    const r = await svc.earnings("t-1", FROM, TO, undefined, { role: Role.OWNER });

    const alex = r.professionals.find((p) => p.professionalId === "p1")!;
    expect(alex).toMatchObject({
      name: "Alex",
      ticketCount: 2,
      grossCents: 10000,
      discountCents: 600,
      netCents: 9400,
      commissionCents: 3000,
      houseCents: 6400,
      payableBalanceCents: 3000, // 5000 de comissões no histórico − 2000 já repassados
    });
    const bruna = r.professionals.find((p) => p.professionalId === "p2")!;
    expect(bruna).toMatchObject({ grossCents: 4000, discountCents: 400, netCents: 3600, payableBalanceCents: 800 });

    // ordenado por faturamento bruto; totais fecham com a soma das linhas
    expect(r.professionals.map((p) => p.name)).toEqual(["Alex", "Bruna"]);
    expect(r.totals).toMatchObject({
      grossCents: 14000,
      discountCents: 1000,
      netCents: 13000,
      commissionCents: 3800,
      payableBalanceCents: 3800,
      ticketCount: 3,
    });
  });

  it("o desconto é rateado entre TODOS os itens, inclusive os sem profissional", async () => {
    const { svc } = build({
      gross: [{ professionalId: "p1", gross: 5000n, tickets: 1n }],
      discounted: [
        {
          discountCents: 1000,
          items: [
            { professionalId: "p1", unitPriceCents: 5000, quantity: 1 },
            { professionalId: null, unitPriceCents: 5000, quantity: 1 },
          ],
        },
      ],
      professionals: [pro("p1", "Alex")],
    });

    const r = await svc.earnings("t-1", FROM, TO, undefined, { role: Role.OWNER });
    expect(r.professionals[0]).toMatchObject({ grossCents: 5000, discountCents: 500, netCents: 4500 });
  });

  it("profissional ativo sem movimento aparece com zeros (a equipe inteira sempre aparece)", async () => {
    const { svc } = build({ professionals: [pro("p1", "Alex")] });
    const r = await svc.earnings("t-1", FROM, TO, undefined, { role: Role.OWNER });
    expect(r.professionals).toEqual([
      expect.objectContaining({ professionalId: "p1", grossCents: 0, netCents: 0, payableBalanceCents: 0 }),
    ]);
  });

  it("sempre filtra por tenantId, no groupBy e na busca de profissionais", async () => {
    const { svc, prisma } = build();
    await svc.earnings("t-1", FROM, TO, undefined, { role: Role.OWNER });
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t-1" }) }),
    );
    expect(prisma.commissionEntry.groupBy).toHaveBeenCalledTimes(2);
    for (const call of prisma.commissionEntry.groupBy.mock.calls) {
      expect(call[0].where).toMatchObject({ tenantId: "t-1" });
    }
    expect(prisma.commissionPayout.groupBy.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1" });
    expect(prisma.professional.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t-1" });
  });

  it("PROFESSIONAL pedindo o id de outro colega só vê o próprio, chamando o service direto", async () => {
    const { svc, prisma } = build({ professionals: [pro("eu", "Eu")] });
    await svc.earnings("t-1", FROM, TO, "colega", { role: Role.PROFESSIONAL, professionalId: "eu" });

    for (const call of prisma.commissionEntry.groupBy.mock.calls) {
      expect(call[0].where).toMatchObject({ professionalId: "eu" });
    }
    expect(prisma.commissionPayout.groupBy.mock.calls[0][0].where).toMatchObject({ professionalId: "eu" });
    expect(prisma.professional.findMany.mock.calls[0][0].where).toMatchObject({ id: "eu" });
  });

  // Se o filtro sumisse para PROFESSIONAL sem vínculo, ele veria o faturamento da equipe inteira.
  it("PROFESSIONAL sem professionalId no token recebe vazio e não consulta o banco", async () => {
    const { svc, prisma } = build();
    const r = await svc.earnings("t-1", FROM, TO, undefined, { role: Role.PROFESSIONAL });
    expect(r.professionals).toEqual([]);
    expect(r.totals.grossCents).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.commissionEntry.groupBy).not.toHaveBeenCalled();
  });

  it("recusa intervalo inválido ou maior que 366 dias, sem consultar o banco", async () => {
    const { svc, prisma } = build();
    await expect(
      svc.earnings("t-1", "1970-01-01T00:00:00Z", "2100-01-01T00:00:00Z", undefined, { role: Role.OWNER }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.earnings("t-1", "lixo", TO, undefined, { role: Role.OWNER }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("CommissionsService.report: PROFESSIONAL sem vínculo", () => {
  it("não vaza o tenant inteiro: retorna vazio sem consultar", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new CommissionsService({ commissionEntry: { findMany } } as unknown as PrismaService);
    const r = await svc.report("t-1", FROM, TO, undefined, { role: Role.PROFESSIONAL });
    expect(r).toEqual({ totalCents: 0, byProfessional: [], entries: [] });
    expect(findMany).not.toHaveBeenCalled();
  });
});

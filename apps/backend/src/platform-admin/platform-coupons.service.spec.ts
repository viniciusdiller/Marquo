import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformCouponsService } from "./platform-coupons.service";

const ACTOR = "admin@marquo.com.br";
const ID = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;

const stored = (over: Record<string, unknown> = {}) => ({
  id: ID,
  code: "PROMO30",
  kind: "TRIAL_DAYS",
  value: 30,
  description: null,
  maxRedemptions: null,
  redemptionCount: 0,
  validFrom: null,
  validUntil: null,
  isActive: true,
  createdAt: new Date(),
  ...over,
});

function build(current: Record<string, unknown> | null = stored()) {
  const tx = {
    coupon: {
      create: jest.fn().mockImplementation(async ({ data }) => stored({ ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => stored({ ...(current ?? {}), ...data })),
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    coupon: {
      findFirst: jest.fn().mockResolvedValue(current),
      findMany: jest.fn().mockResolvedValue([stored()]),
      count: jest.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;
  return { service: new PlatformCouponsService(prisma), tx, prisma };
}

describe("PlatformCouponsService.create", () => {
  const DTO = { code: "PROMO30", kind: "TRIAL_DAYS" as never, value: 30 };

  it("cria o cupom e audita (com ator e código, sem dado pessoal)", async () => {
    const { service, tx } = build();
    const created = await service.create(DTO, ACTOR);

    expect(created.code).toBe("PROMO30");
    expect(created.state).toBe("ACTIVE");
    expect(tx.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "COUPON_CREATED",
      actor: ACTOR,
    });
  });

  // Faixa depende do tipo: 150% ou 400 dias de teste são erro de digitação, não campanha.
  it.each([
    ["percentual acima de 100", { kind: "PERCENT", value: 150 }],
    ["dias acima de 365", { kind: "TRIAL_DAYS", value: 400 }],
    ["desconto fixo acima do teto", { kind: "FIXED_CENTS", value: 2_000_000 }],
  ])("recusa %s", async (_label, patch) => {
    const { service, tx } = build();
    await expect(service.create({ ...DTO, ...(patch as object) } as never, ACTOR)).rejects.toThrow(BadRequestException);
    expect(tx.coupon.create).not.toHaveBeenCalled();
  });

  it("recusa código fora do padrão (o DTO não é a última linha)", async () => {
    const { service } = build();
    await expect(service.create({ ...DTO, code: "ab c" }, ACTOR)).rejects.toThrow(BadRequestException);
    await expect(service.create({ ...DTO, code: "x'; DROP" }, ACTOR)).rejects.toThrow(BadRequestException);
  });

  it("recusa validade que já passou ou termina antes de começar", async () => {
    const { service } = build();
    await expect(
      service.create({ ...DTO, validUntil: new Date(Date.now() - DAY).toISOString() }, ACTOR),
    ).rejects.toThrow(/futuro/);
    await expect(
      service.create(
        {
          ...DTO,
          validFrom: new Date(Date.now() + 10 * DAY).toISOString(),
          validUntil: new Date(Date.now() + 5 * DAY).toISOString(),
        },
        ACTOR,
      ),
    ).rejects.toThrow(/depois do início/);
  });

  it("código repetido: 409 (decidido pelo banco)", async () => {
    const { service, tx } = build();
    tx.coupon.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["code"] } }),
    );
    await expect(service.create(DTO, ACTOR)).rejects.toThrow(ConflictException);
  });
});

describe("PlatformCouponsService.update", () => {
  it("desativa e audita", async () => {
    const { service, tx } = build();
    const result = await service.update(ID, { isActive: false }, ACTOR);
    expect(result.state).toBe("DISABLED");
    expect(tx.coupon.update.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(tx.adminAuditLog.create.mock.calls[0][0].data.action).toBe("COUPON_UPDATED");
  });

  it("não deixa o limite de usos ficar abaixo do que já foi resgatado", async () => {
    const { service, tx } = build(stored({ redemptionCount: 7 }));
    await expect(service.update(ID, { maxRedemptions: 5 }, ACTOR)).rejects.toThrow(/7 já resgatados/);
    expect(tx.coupon.update).not.toHaveBeenCalled();
  });

  // Tipo, valor e código não existem no DTO de update: quem já resgatou contou com eles.
  it("só os campos permitidos chegam ao banco", async () => {
    const { service, tx } = build();
    await service.update(ID, { isActive: false, kind: "PERCENT", value: 99, code: "OUTRO" } as never, ACTOR);
    expect(Object.keys(tx.coupon.update.mock.calls[0][0].data)).toEqual(["isActive"]);
  });

  it("nada a mudar: devolve o cupom sem escrever nem auditar", async () => {
    const { service, tx } = build();
    await service.update(ID, {}, ACTOR);
    expect(tx.coupon.update).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("inexistente: 404", async () => {
    const { service } = build(null);
    await expect(service.update(ID, { isActive: false }, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

describe("PlatformCouponsService.list", () => {
  it("devolve o estado calculado de cada cupom, paginado", async () => {
    const { service } = build();
    const page = await service.list({ page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0].state).toBe("ACTIVE");
  });
});

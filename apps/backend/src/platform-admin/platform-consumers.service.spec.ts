import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { DeleteConsumerDto } from "./dto/platform-admin.dto";
import { AUDIT_CONSUMER_DELETED, PlatformConsumersService } from "./platform-consumers.service";
import { PrismaService } from "../prisma/prisma.service";

const ID = "3f2b8f0e-0000-4000-8000-0000000000c1";
const REASON = "pedido do titular em 22/10";

function build(consumer: unknown = { id: ID, phone: "11987654321", _count: { tenantLinks: 2 } }) {
  const calls: string[] = [];
  const tx = {
    adminAuditLog: { create: jest.fn(async () => void calls.push("audit")) },
    consumer: { delete: jest.fn(async () => void calls.push("delete")) },
  };
  const prisma = {
    consumer: {
      findUnique: jest.fn().mockResolvedValue(consumer),
      findMany: jest.fn().mockResolvedValue([
        { id: ID, name: "Ana", email: "a@x.com", phone: "11987654321", createdAt: new Date(), _count: { tenantLinks: 2, reviews: 1 } },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { service: new PlatformConsumersService(prisma as unknown as PrismaService), prisma, tx, calls };
}

describe("PlatformConsumersService.remove", () => {
  it("audita primeiro e exclui só a conta, na mesma transação, sem dado pessoal na auditoria", async () => {
    const { service, tx, calls } = build();
    await expect(service.remove(ID, { confirmPhone: "(11) 98765-4321", reason: REASON }, "admin@x.com")).resolves.toEqual({
      deleted: true,
    });

    expect(calls).toEqual(["audit", "delete"]);
    const data = (tx.adminAuditLog.create.mock.calls[0] as unknown[])[0] as { data: { action: string; actor: string; detail: string } };
    expect(data.data).toMatchObject({ action: AUDIT_CONSUMER_DELETED, actor: "admin@x.com" });
    expect(data.data.detail).toContain("salões vinculados=2");
    expect(data.data.detail).not.toContain("11987654321");
    expect(tx.consumer.delete).toHaveBeenCalledWith({ where: { id: ID } });
  });

  it("aceita o telefone com DDI 55 (normaliza antes de comparar)", async () => {
    const { service } = build();
    await expect(service.remove(ID, { confirmPhone: "+55 11 98765-4321", reason: REASON }, "a@b.com")).resolves.toEqual({ deleted: true });
  });

  it("telefone digitado diferente: 400 e NADA é escrito", async () => {
    const { service, prisma } = build();
    await expect(service.remove(ID, { confirmPhone: "11911112222", reason: REASON }, "a@b.com")).rejects.toThrow(BadRequestException);
    await expect(service.remove(ID, { confirmPhone: "", reason: REASON }, "a@b.com")).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sem motivo (ou curto demais): 400 e NADA é escrito", async () => {
    const { service, prisma } = build();
    await expect(service.remove(ID, { confirmPhone: "11987654321", reason: "curto" }, "a@b.com")).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("conta inexistente: 404", async () => {
    const { service, prisma } = build(null);
    await expect(service.remove(ID, { confirmPhone: "11987654321", reason: REASON }, "a@b.com")).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PlatformConsumersService.list", () => {
  it("devolve a página com contagem de salões e avaliações, sem hash nem token", async () => {
    const { service, prisma } = build();
    const page = await service.list({ page: 1, pageSize: 20, search: "Ana" } as never);

    expect(page.items[0]).toEqual(expect.objectContaining({ id: ID, salons: 2, reviews: 1 }));
    expect(page.items[0]).not.toHaveProperty("passwordHash");
    const select = (prisma.consumer.findMany.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    expect(select).not.toHaveProperty("passwordHash");
  });

  it("busca por telefone só com 4+ dígitos", async () => {
    const { service, prisma } = build();
    await service.list({ page: 1, pageSize: 20, search: "123" } as never);
    const where = (prisma.consumer.findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toHaveLength(2);
  });
});

describe("rotas de clientes finais (plataforma)", () => {
  const proto = PlatformAdminController.prototype;
  const guards = (h: keyof PlatformAdminController) => Reflect.getMetadata("__guards__", proto[h] as object) as unknown[];

  it.each(["listConsumers", "deleteConsumer"] as const)("%s exige a sessão da plataforma", (handler) => {
    expect(guards(handler)).toContain(PlatformAdminGuard);
  });

  it("excluir usa o e-mail da conta como autor", async () => {
    const remove = jest.fn().mockResolvedValue({ deleted: true });
    const controller = new PlatformAdminController({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { remove } as never);
    await controller.deleteConsumer(ID, { confirmPhone: "11987654321", reason: REASON }, { email: "admin@x.com" } as never);
    expect(remove).toHaveBeenCalledWith(ID, { confirmPhone: "11987654321", reason: REASON }, "admin@x.com");
  });

  it("o DTO exige telefone e motivo de 10 a 300 caracteres", async () => {
    const errors = async (body: unknown) => (await validate(plainToInstance(DeleteConsumerDto, body as object))).length;
    expect(await errors({ confirmPhone: "11987654321", reason: REASON })).toBe(0);
    expect(await errors({ confirmPhone: "11987654321" })).toBeGreaterThan(0);
    expect(await errors({ confirmPhone: "11987654321", reason: "curto" })).toBeGreaterThan(0);
    expect(await errors({ confirmPhone: "11987654321", reason: "x".repeat(301) })).toBeGreaterThan(0);
    expect(await errors({ reason: REASON })).toBeGreaterThan(0);
  });
});

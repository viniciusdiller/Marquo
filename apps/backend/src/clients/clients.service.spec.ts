import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { PrismaService } from "../prisma/prisma.service";

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    client: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "c-1", ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: "c-1", ...data })),
      upsert: jest.fn().mockImplementation(({ create }) => ({ id: "c-1", ...create })),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe("ClientsService (M2)", () => {
  it("create normaliza telefone e recusa duplicado", async () => {
    const prisma = buildPrisma();
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ id: "existing" });
    const service = new ClientsService(prisma);

    await expect(
      service.create("t-1", { name: "Ana", phone: "(11) 98888-7777" }),
    ).rejects.toThrow(ConflictException);
  });

  it("create recusa telefone implausível", async () => {
    const service = new ClientsService(buildPrisma());
    await expect(service.create("t-1", { name: "Ana", phone: "123" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("create sanitiza cpf (só dígitos) e tags (dedupe/trim)", async () => {
    const prisma = buildPrisma();
    const service = new ClientsService(prisma);

    await service.create("t-1", {
      name: " Ana ",
      phone: "11988887777",
      cpf: "529.982.247-25",
      tags: [" VIP ", "VIP", "coloração"],
    });

    const data = (prisma.client.create as jest.Mock).mock.calls[0][0].data;
    expect(data.cpf).toBe("52998224725");
    expect(data.tags).toEqual(["VIP", "coloração"]);
    expect(data.name).toBe("Ana");
  });

  it("update rejeita cliente de outro tenant", async () => {
    const prisma = buildPrisma();
    (prisma.client.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ClientsService(prisma);

    await expect(service.update("t-1", "c-9", { name: "Novo" })).rejects.toThrow(NotFoundException);
    // Não basta lançar NotFound — precisa ter sido POR TER FILTRADO por tenantId (senão um
    // findFirst({ where: { id } }) sem tenantId também retornaria null pra um id inexistente
    // e o teste passaria sem provar isolamento nenhum).
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "c-9", tenantId: "t-1" }) }),
    );
  });

  // Regressão: upsertForBooking sobrescrevia o nome do cliente em TODO novo agendamento
  // (mesmo telefone), então um familiar agendando pelo mesmo número, ou um typo, apagava
  // silenciosamente o nome já cadastrado. Corrigir nome agora é uma ação explícita
  // (edição de cliente), não efeito colateral de marcar horário.
  it("upsertForBooking não sobrescreve o nome de um cliente já cadastrado", async () => {
    const prisma = buildPrisma();
    const service = new ClientsService(prisma);

    await service.upsertForBooking(prisma, "t-1", "Nome Diferente Digitado Agora", "11988887777");

    const call = (prisma.client.upsert as jest.Mock).mock.calls[0][0];
    expect(call.update).toEqual({});
    expect(call.create.name).toBe("Nome Diferente Digitado Agora");
  });

  it("getDetail deduplica respostas de anamnese pela mais recente por form", async () => {
    const prisma = buildPrisma();
    (prisma as unknown as { ticket: unknown }).ticket = { findMany: jest.fn().mockResolvedValue([]) };
    (prisma.client.findFirst as jest.Mock).mockResolvedValue({
      id: "c-1",
      appointments: [],
      intakeResponses: [
        { id: "r-2", formId: "f-1", updatedAt: new Date("2026-02-01") },
        { id: "r-1", formId: "f-1", updatedAt: new Date("2026-01-01") },
        { id: "r-3", formId: "f-2", updatedAt: new Date("2026-01-15") },
      ],
    });
    const service = new ClientsService(prisma);

    const detail = await service.getDetail("t-1", "c-1");

    expect(detail.intakeResponses.map((r) => r.id).sort()).toEqual(["r-2", "r-3"]);
  });

  describe("list com paginação e anti-IDOR", () => {
    it("pagina resultados respeitando page e pageSize", async () => {
      const prisma = buildPrisma();
      (prisma.client.count as jest.Mock).mockResolvedValue(25);
      (prisma.client.findMany as jest.Mock).mockResolvedValue([
        { id: "c-1", name: "Ana", phone: "11999998888", email: null, tags: [], createdAt: new Date(), _count: { appointments: 2 } },
      ]);
      const service = new ClientsService(prisma);

      const result = await service.list("t-1", { page: 2, pageSize: 10 });

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "t-1" },
          skip: 10,
          take: 10,
          orderBy: { name: "asc" },
        }),
      );
      expect(prisma.client.count).toHaveBeenCalledWith({ where: { tenantId: "t-1" } });
      expect(result).toEqual({
        items: expect.any(Array),
        total: 25,
        page: 2,
        pageSize: 10,
        pageCount: 3,
      });
    });

    it("filtra rigorosamente por tenantId garantindo isolamento anti-IDOR", async () => {
      const prisma = buildPrisma();
      const service = new ClientsService(prisma);

      await service.list("tenant-xyz", { search: "Maria" });

      const findCall = (prisma.client.findMany as jest.Mock).mock.calls[0][0];
      const countCall = (prisma.client.count as jest.Mock).mock.calls[0][0];

      expect(findCall.where.tenantId).toBe("tenant-xyz");
      expect(countCall.where.tenantId).toBe("tenant-xyz");
    });

    it("busca por termo normalizando nome e telefone com dígitos", async () => {
      const prisma = buildPrisma();
      const service = new ClientsService(prisma);

      await service.list("t-1", { search: "(11) 98888-7777" });

      const findCall = (prisma.client.findMany as jest.Mock).mock.calls[0][0];
      expect(findCall.where.OR).toEqual([
        { name: { contains: "(11) 98888-7777", mode: "insensitive" } },
        { phone: { contains: "11988887777" } },
      ]);
    });
  });
});

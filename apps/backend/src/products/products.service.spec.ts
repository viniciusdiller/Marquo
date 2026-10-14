import { NotFoundException } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { PrismaService } from "../prisma/prisma.service";

function build(over: Record<string, unknown> = {}) {
  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: "p-1", tenantId: "t-1", name: "Pomada" }),
    },
    stockMovement: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 7 } }),
      groupBy: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "sm-1", ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ...over,
  } as unknown as PrismaService;
  return { service: new ProductsService(prisma), prisma };
}

describe("ProductsService", () => {
  it("stockBalance soma os movimentos", async () => {
    const { service } = build();
    expect(await service.stockBalance("t-1", "p-1")).toBe(7);
  });

  it("adjustStock OUT grava quantidade negativa", async () => {
    const { service, prisma } = build();
    await service.adjustStock("t-1", "p-1", { kind: "OUT", quantity: 3 });
    expect((prisma.stockMovement.create as jest.Mock).mock.calls[0][0].data.quantity).toBe(-3);
  });

  it("adjustStock IN normaliza para positivo", async () => {
    const { service, prisma } = build();
    await service.adjustStock("t-1", "p-1", { kind: "IN", quantity: -5 });
    expect((prisma.stockMovement.create as jest.Mock).mock.calls[0][0].data.quantity).toBe(5);
  });

  it("adjustStock ADJUSTMENT mantém o sinal", async () => {
    const { service, prisma } = build();
    await service.adjustStock("t-1", "p-1", { kind: "ADJUSTMENT", quantity: -2 });
    expect((prisma.stockMovement.create as jest.Mock).mock.calls[0][0].data.quantity).toBe(-2);
  });

  it("produto de outro tenant lança NotFound", async () => {
    const { service, prisma } = build();
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.getOrThrow("t-1", "p-9")).rejects.toThrow(NotFoundException);
  });

  describe("listMovements", () => {
    it("devolve movimentos paginados respeitando skip e take", async () => {
      const { service, prisma } = build();
      (prisma.stockMovement.count as jest.Mock).mockResolvedValue(25);
      (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue([
        { id: "sm-1", productId: "p-1", quantity: 5 },
      ]);

      const result = await service.listMovements("t-1", "p-1", { page: 2, pageSize: 10 });

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "t-1", productId: "p-1" },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(25);
      expect(result.pageCount).toBe(3);
      expect(result.items).toHaveLength(1);
    });

    it("Anti-IDOR: lança NotFoundException se produto pertencer a outro tenant", async () => {
      const { service, prisma } = build();
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.listMovements("tenant-A", "produto-do-tenant-B", { page: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});


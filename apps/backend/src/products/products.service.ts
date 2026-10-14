import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StockMovementKind } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
    });
    const balances = await this.balancesByProduct(tenantId);
    return products.map((product) => ({ ...product, stock: balances.get(product.id) ?? 0 }));
  }

  async getOrThrow(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) {
      throw new NotFoundException("Produto não encontrado.");
    }
    const stock = await this.stockBalance(tenantId, id);
    return { ...product, stock };
  }

  async create(tenantId: string, dto: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          sku: dto.sku?.trim() || null,
          priceCents: dto.priceCents,
          costCents: dto.costCents ?? null,
        },
      });
      if (dto.initialStock && dto.initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: product.id,
            kind: StockMovementKind.IN,
            quantity: dto.initialStock,
            note: "Estoque inicial",
          },
        });
      }
      return { ...product, stock: dto.initialStock ?? 0 };
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.getOrThrow(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.costCents !== undefined ? { costCents: dto.costCents } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async adjustStock(tenantId: string, id: string, dto: AdjustStockDto) {
    await this.getOrThrow(tenantId, id);

    let quantity = dto.quantity;
    if (dto.kind === "IN") quantity = Math.abs(dto.quantity);
    if (dto.kind === "OUT") quantity = -Math.abs(dto.quantity);
    // ADJUSTMENT mantém o sinal informado.

    if (quantity === 0) {
      throw new BadRequestException("Quantidade não pode ser zero.");
    }

    return this.prisma.stockMovement.create({
      data: {
        tenantId,
        productId: id,
        kind: dto.kind as StockMovementKind,
        quantity,
        note: dto.note?.trim() || null,
      },
    });
  }

  listMovements(tenantId: string, productId: string) {
    return this.prisma.stockMovement.findMany({
      where: { tenantId, productId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async stockBalance(tenantId: string, productId: string): Promise<number> {
    const result = await this.prisma.stockMovement.aggregate({
      where: { tenantId, productId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private async balancesByProduct(tenantId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { tenantId },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
  }

  // Usado pelo fechamento de comanda (mesma transação): baixa de venda amarrada ao item.
  async registerSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    quantity: number,
    ticketItemId: string,
  ) {
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId,
        kind: StockMovementKind.SALE,
        quantity: -Math.abs(quantity),
        ticketItemId,
      },
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CashMovementKind, CashRegisterStatus, PaymentMethod, Prisma } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { OpenCashRegisterDto } from "./dto/open-cash-register.dto";
import { CashMovementDto, CloseCashRegisterDto } from "./dto/cash-movement.dto";

@Injectable()
export class CashRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  // Caixa OPEN atual do tenant, ou null. Usado pelo fluxo de comanda para amarrar
  // pagamento em dinheiro ao caixa.
  currentOpen(tenantId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.cashRegister.findFirst({
      where: { tenantId, status: CashRegisterStatus.OPEN },
    });
  }

  async open(tenantId: string, userId: string, dto: OpenCashRegisterDto) {
    const existing = await this.currentOpen(tenantId);
    if (existing) {
      throw new ConflictException("Já existe um caixa aberto. Feche-o antes de abrir outro.");
    }
    return this.prisma.$transaction(async (tx) => {
      const register = await tx.cashRegister.create({
        data: {
          tenantId,
          openedByUserId: userId,
          openingFloatCents: dto.openingFloatCents,
          note: dto.note?.trim() || null,
        },
      });
      if (dto.openingFloatCents > 0) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: register.id,
            kind: CashMovementKind.OPENING,
            amountCents: dto.openingFloatCents,
            note: "Fundo de troco",
          },
        });
      }
      return register;
    });
  }

  async addMovement(tenantId: string, dto: CashMovementDto) {
    const register = await this.requireOpen(tenantId);

    if (dto.kind === "WITHDRAWAL") {
      const balance = await this.expectedCashCents(register.id);
      if (dto.amountCents > balance) {
        throw new BadRequestException(
          `Sangria (${dto.amountCents}) maior que o dinheiro em caixa (${balance}).`,
        );
      }
    }

    return this.prisma.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        kind: dto.kind as CashMovementKind,
        amountCents: dto.amountCents,
        note: dto.note?.trim() || null,
      },
    });
  }

  async close(tenantId: string, dto: CloseCashRegisterDto) {
    const register = await this.requireOpen(tenantId);
    const expected = await this.expectedCashCents(register.id);

    const closed = await this.prisma.cashRegister.update({
      where: { id: register.id },
      data: {
        status: CashRegisterStatus.CLOSED,
        closedAt: new Date(),
        closingCountedCents: dto.closingCountedCents,
        note: dto.note?.trim() ?? register.note,
      },
    });

    return {
      ...closed,
      expectedCashCents: expected,
      differenceCents: dto.closingCountedCents - expected,
    };
  }

  async summary(tenantId: string) {
    const register = await this.currentOpen(tenantId);
    if (!register) {
      return { open: false as const };
    }
    const [movements, payments, expected] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where: { cashRegisterId: register.id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.payment.groupBy({
        by: ["method"],
        where: { cashRegisterId: register.id },
        _sum: { amountCents: true },
      }),
      this.expectedCashCents(register.id),
    ]);

    return {
      open: true as const,
      register,
      movements,
      paymentsByMethod: payments.map((p) => ({
        method: p.method,
        totalCents: p._sum.amountCents ?? 0,
      })),
      expectedCashCents: expected,
    };
  }

  // Dinheiro esperado em gaveta = fundo + entradas − saídas + vendas em dinheiro.
  private async expectedCashCents(cashRegisterId: string): Promise<number> {
    const [movements, cashPayments] = await Promise.all([
      this.prisma.cashMovement.findMany({ where: { cashRegisterId } }),
      this.prisma.payment.aggregate({
        where: { cashRegisterId, method: PaymentMethod.CASH },
        _sum: { amountCents: true },
      }),
    ]);

    let total = cashPayments._sum.amountCents ?? 0;
    for (const movement of movements) {
      if (
        movement.kind === CashMovementKind.OPENING ||
        movement.kind === CashMovementKind.DEPOSIT
      ) {
        total += movement.amountCents;
      } else if (movement.kind === CashMovementKind.WITHDRAWAL) {
        total -= movement.amountCents;
      }
      // SALE já contabilizado via Payment acima — o CashMovement SALE (se criado) é só
      // trilha; não somamos de novo aqui.
    }
    return total;
  }

  private async requireOpen(tenantId: string) {
    const register = await this.currentOpen(tenantId);
    if (!register) {
      throw new NotFoundException("Nenhum caixa aberto.");
    }
    return register;
  }
}

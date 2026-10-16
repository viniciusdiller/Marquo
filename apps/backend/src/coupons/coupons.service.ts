import { BadRequestException, Injectable } from "@nestjs/common";
import { CouponKind, Prisma } from "@marquo/database";
import { couponState, isValidCouponCode, normalizeCouponCode } from "./coupon.util";

export const COUPON_INVALID_MESSAGE = "Cupom inválido ou expirado.";

export interface RedeemedCoupon {
  couponId: string;
  kind: CouponKind;
  value: number;
}

// Resgate de cupom no cadastro. Roda DENTRO da transação do cadastro: se o negócio não for criado, o
// resgate (e a contagem de usos) é desfeito junto.
@Injectable()
export class CouponsService {
  // Valida o cupom e reserva um uso de forma ATÔMICA: o UPDATE condicional só incrementa se ele ainda estiver
  // ativo, dentro da validade e com uso sobrando — dois cadastros simultâneos no último uso não passam os
  // dois (nada de "contar, depois incrementar"). Toda recusa devolve a mesma mensagem, sem dizer por quê
  // (inexistente, expirado, esgotado), para não permitir sondar códigos.
  async reserve(tx: Prisma.TransactionClient, rawCode: string): Promise<RedeemedCoupon> {
    const code = normalizeCouponCode(rawCode);
    if (!isValidCouponCode(code)) throw new BadRequestException(COUPON_INVALID_MESSAGE);

    const coupon = await tx.coupon.findUnique({
      where: { code },
      select: { id: true, kind: true, value: true, isActive: true, validFrom: true, validUntil: true, maxRedemptions: true, redemptionCount: true },
    });
    if (!coupon || couponState(coupon) !== "ACTIVE") throw new BadRequestException(COUPON_INVALID_MESSAGE);

    const reserved = await tx.$executeRaw`
      UPDATE "Coupon"
         SET "redemptionCount" = "redemptionCount" + 1, "updatedAt" = now()
       WHERE "id" = ${coupon.id}
         AND "isActive" = true
         AND ("validFrom" IS NULL OR "validFrom" <= now())
         AND ("validUntil" IS NULL OR "validUntil" > now())
         AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")`;
    if (reserved !== 1) throw new BadRequestException(COUPON_INVALID_MESSAGE);

    return { couponId: coupon.id, kind: coupon.kind, value: coupon.value };
  }

  async recordRedemption(tx: Prisma.TransactionClient, couponId: string, tenantId: string): Promise<void> {
    await tx.couponRedemption.create({ data: { couponId, tenantId } });
  }
}

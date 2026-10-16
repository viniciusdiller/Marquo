import { CouponKind } from "@marquo/database";

// Código do cupom: sempre maiúsculo, sem espaços nas pontas e só letras, números, "_" e "-". Normalizado
// no servidor (quem digita "promo30 " resgata o mesmo cupom que "PROMO30").
export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCouponCode(code: string): boolean {
  return COUPON_CODE_PATTERN.test(code);
}

// Faixa válida do valor por tipo: o DTO valida o tipo (número inteiro), mas "30" significa coisas
// diferentes em cada kind, então a faixa depende dele (e o service repete a regra).
export function couponValueError(kind: CouponKind, value: number): string | null {
  if (!Number.isInteger(value)) return "O valor do cupom precisa ser um número inteiro.";
  switch (kind) {
    case CouponKind.TRIAL_DAYS:
      return value >= 1 && value <= 365 ? null : "Dias de teste do cupom: de 1 a 365.";
    case CouponKind.PERCENT:
      return value >= 1 && value <= 100 ? null : "Percentual do cupom: de 1 a 100.";
    case CouponKind.FIXED_CENTS:
      return value >= 1 && value <= 1_000_000 ? null : "Desconto fixo do cupom: de R$ 0,01 a R$ 10.000,00.";
  }
}

export type CouponState = "ACTIVE" | "DISABLED" | "NOT_STARTED" | "EXPIRED" | "EXHAUSTED";

// Estado de um cupom no instante `now`. Mesma regra usada para resgatar e para mostrar na lista.
export function couponState(
  coupon: {
    isActive: boolean;
    validFrom: Date | null;
    validUntil: Date | null;
    maxRedemptions: number | null;
    redemptionCount: number;
  },
  now: Date = new Date(),
): CouponState {
  if (!coupon.isActive) return "DISABLED";
  if (coupon.validFrom && coupon.validFrom.getTime() > now.getTime()) return "NOT_STARTED";
  if (coupon.validUntil && coupon.validUntil.getTime() <= now.getTime()) return "EXPIRED";
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) return "EXHAUSTED";
  return "ACTIVE";
}

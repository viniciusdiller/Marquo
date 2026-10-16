import { CouponKind } from "@marquo/database";
import { couponState, couponValueError, isValidCouponCode, normalizeCouponCode } from "./coupon.util";

const HOUR = 3_600_000;
const base = { isActive: true, validFrom: null, validUntil: null, maxRedemptions: null, redemptionCount: 0 };

describe("normalizeCouponCode / isValidCouponCode", () => {
  it("apara e põe em maiúsculas", () => {
    expect(normalizeCouponCode("  promo30 ")).toBe("PROMO30");
  });

  it.each(["PROMO30", "BEM-VINDO", "NATAL_2026", "ABC"])("aceita %s", (code) => {
    expect(isValidCouponCode(code)).toBe(true);
  });

  it.each(["AB", "A".repeat(33), "COM ESPAÇO", "promo", "PROMO!", "CUPOM%", "ação", ""])("recusa %j", (code) => {
    expect(isValidCouponCode(code)).toBe(false);
  });
});

describe("couponValueError", () => {
  it("TRIAL_DAYS: 1..365", () => {
    expect(couponValueError(CouponKind.TRIAL_DAYS, 30)).toBeNull();
    expect(couponValueError(CouponKind.TRIAL_DAYS, 0)).not.toBeNull();
    expect(couponValueError(CouponKind.TRIAL_DAYS, 366)).not.toBeNull();
  });

  // 150% de desconto ou um fixo gigante é erro de digitação que viraria cobrança negativa.
  it("PERCENT: 1..100", () => {
    expect(couponValueError(CouponKind.PERCENT, 100)).toBeNull();
    expect(couponValueError(CouponKind.PERCENT, 101)).not.toBeNull();
    expect(couponValueError(CouponKind.PERCENT, 0)).not.toBeNull();
  });

  it("FIXED_CENTS: 1..1.000.000 centavos e inteiro", () => {
    expect(couponValueError(CouponKind.FIXED_CENTS, 1000)).toBeNull();
    expect(couponValueError(CouponKind.FIXED_CENTS, 1_000_001)).not.toBeNull();
    expect(couponValueError(CouponKind.FIXED_CENTS, 10.5)).not.toBeNull();
  });
});

describe("couponState", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("ativo sem limites", () => {
    expect(couponState(base, now)).toBe("ACTIVE");
  });

  it("desativado vence tudo", () => {
    expect(couponState({ ...base, isActive: false }, now)).toBe("DISABLED");
  });

  it("ainda não começou / já expirou (fim exclusivo)", () => {
    expect(couponState({ ...base, validFrom: new Date(now.getTime() + HOUR) }, now)).toBe("NOT_STARTED");
    expect(couponState({ ...base, validUntil: new Date(now.getTime() - HOUR) }, now)).toBe("EXPIRED");
    expect(couponState({ ...base, validUntil: now }, now)).toBe("EXPIRED");
  });

  it("esgotado ao atingir o limite de usos", () => {
    expect(couponState({ ...base, maxRedemptions: 10, redemptionCount: 9 }, now)).toBe("ACTIVE");
    expect(couponState({ ...base, maxRedemptions: 10, redemptionCount: 10 }, now)).toBe("EXHAUSTED");
  });
});

import { CouponKind } from "@marquo/database";
import { addOneMonth, centsToReais, MIN_CHARGE_CENTS, mpDateTime, nextPeriodStart, priceWithCoupon, reaisToCents } from "./pricing";

describe("priceWithCoupon", () => {
  const LIST = 9990;

  it("sem cupom: preço cheio", () => {
    expect(priceWithCoupon(LIST, null)).toEqual({ listPriceCents: LIST, discountCents: 0, chargeCents: LIST });
  });

  it("percentual arredonda para o centavo", () => {
    expect(priceWithCoupon(LIST, { kind: CouponKind.PERCENT, value: 20 })).toEqual({
      listPriceCents: LIST,
      discountCents: 1998,
      chargeCents: 7992,
    });
    expect(priceWithCoupon(9990, { kind: CouponKind.PERCENT, value: 33 }).discountCents).toBe(3297);
  });

  it("valor fixo abate em centavos", () => {
    expect(priceWithCoupon(LIST, { kind: CouponKind.FIXED_CENTS, value: 2000 }).chargeCents).toBe(7990);
  });

  // Um cupom de 100% ou de valor maior que o plano nunca gera cobrança negativa nem de centavos.
  it("nunca cobra menos que o mínimo", () => {
    expect(priceWithCoupon(LIST, { kind: CouponKind.PERCENT, value: 100 }).chargeCents).toBe(MIN_CHARGE_CENTS);
    expect(priceWithCoupon(LIST, { kind: CouponKind.FIXED_CENTS, value: 999_999 }).chargeCents).toBe(MIN_CHARGE_CENTS);
  });

  it("cupom de dias de teste não é desconto de cobrança", () => {
    expect(priceWithCoupon(LIST, { kind: CouponKind.TRIAL_DAYS, value: 30 })).toEqual({
      listPriceCents: LIST,
      discountCents: 0,
      chargeCents: LIST,
    });
  });

  it("plano mais barato que o mínimo não gera desconto negativo", () => {
    expect(priceWithCoupon(300, { kind: CouponKind.PERCENT, value: 50 })).toEqual({
      listPriceCents: 300,
      discountCents: 0,
      chargeCents: 300,
    });
  });

  it("desconto + cobrado sempre somam o preço de lista", () => {
    for (const value of [1, 7, 25, 50, 99, 100]) {
      const q = priceWithCoupon(18990, { kind: CouponKind.PERCENT, value });
      expect(q.discountCents + q.chargeCents).toBe(q.listPriceCents);
    }
  });
});

describe("centavos <-> reais", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(centsToReais(9990)).toBe(99.9);
    expect(centsToReais(7992)).toBe(79.92);
    expect(centsToReais(1)).toBe(0.01);
    expect(reaisToCents(79.92)).toBe(7992);
    expect(reaisToCents(0.07)).toBe(7);
  });
});

describe("períodos", () => {
  it("um mês de calendário (31/01 vira 28/02)", () => {
    const next = addOneMonth(new Date("2027-01-31T15:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("pagar antes do vencimento soma a partir do fim atual; depois, a partir de agora", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const future = new Date("2026-10-20T12:00:00Z");
    const past = new Date("2026-10-01T12:00:00Z");
    expect(nextPeriodStart(future, now)).toEqual(future);
    expect(nextPeriodStart(past, now)).toEqual(now);
    expect(nextPeriodStart(null, now)).toEqual(now);
  });

  it("data de expiração do Pix com offset de São Paulo", () => {
    expect(mpDateTime(new Date("2026-10-15T15:00:00.000Z"))).toBe("2026-10-15T12:00:00.000-03:00");
  });
});

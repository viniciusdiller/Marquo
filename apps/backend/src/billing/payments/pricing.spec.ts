import { CouponKind } from "@marquo/database";
import { addOneMonth, asaasDate, prorateUpgrade, asaasDateTime, centsToReais, paidAmountMatches, parseAsaasDate, MIN_CHARGE_CENTS, nextPeriodStart, priceWithCoupon, reaisToCents } from "./pricing";

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

  it("paidAmountMatches: valor exato ao centavo, estrito no tipo", () => {
    expect(paidAmountMatches(99.9, 9990)).toBe(true);
    expect(paidAmountMatches(79.92, 7992)).toBe(true);
    // Ponto flutuante: 0.1 + 0.2 e 4.35 não podem derrubar um valor certo.
    expect(paidAmountMatches(4.35, 435)).toBe(true);
    for (const bad of [99.91, 99.89, 100, 0, -99.9, Number.NaN, Infinity, "99.90", "9990", null, undefined, {}, [99.9], true]) {
      expect(paidAmountMatches(bad, 9990)).toBe(false);
    }
  });

  it("datas do Asaas no fuso de São Paulo (23h de SP ainda é o mesmo dia civil, mesmo já sendo o dia seguinte em UTC)", () => {
    expect(asaasDate(new Date("2026-10-16T02:30:00.000Z"))).toBe("2026-10-15");
    expect(asaasDateTime(new Date("2026-10-15T15:00:00.000Z"))).toBe("2026-10-15 12:00:00");
  });

  it("lê a data civil do Asaas como meio-dia de São Paulo e recusa lixo", () => {
    expect(parseAsaasDate("2026-11-12")?.toISOString()).toBe("2026-11-12T15:00:00.000Z");
    expect(parseAsaasDate("2026-11-12 10:00:00")?.toISOString()).toBe("2026-11-12T15:00:00.000Z");
    expect(parseAsaasDate(null)).toBeNull();
    expect(parseAsaasDate("ontem")).toBeNull();
  });
});

describe("prorateUpgrade (troca para plano mais caro no meio do período)", () => {
  // Período de 30 dias terminando em 2026-12-01 (novembro tem 30 dias).
  const end = new Date("2026-12-01T15:00:00.000Z");
  const DAYS = (n: number) => n * 86_400_000;

  it("início do período: paga a diferença cheia", () => {
    const start = new Date("2026-11-01T15:00:00.000Z");
    expect(prorateUpgrade(4990, 9990, end, start)).toMatchObject({ chargeCents: 5000, remainingDays: 30 });
  });

  it("metade do período: paga metade da diferença", () => {
    const mid = new Date(end.getTime() - DAYS(15));
    expect(prorateUpgrade(4990, 9990, end, mid).chargeCents).toBe(2500);
  });

  it("arredonda PARA CIMA em centavos (nunca a favor de quem troca)", () => {
    // diferença 10 000 × 1/30 = 333,33… → 334
    const day = new Date(end.getTime() - DAYS(1));
    expect(prorateUpgrade(8990, 18990, end, day).chargeCents).toBe(500); // piso: 334 < 500
    expect(prorateUpgrade(0, 100_000, end, new Date(end.getTime() - DAYS(1))).chargeCents).toBe(3334);
  });

  it("nunca abaixo do piso do provedor (R$ 5,00), mesmo no último dia ou depois do fim", () => {
    expect(prorateUpgrade(4990, 9990, end, new Date(end.getTime() - 1000)).chargeCents).toBe(500);
    expect(prorateUpgrade(4990, 9990, end, new Date(end.getTime() + DAYS(3))).chargeCents).toBe(500);
  });

  it("nunca acima da diferença cheia, mesmo com relógio antes do início do período", () => {
    const early = new Date(end.getTime() - DAYS(90));
    expect(prorateUpgrade(4990, 9990, end, early).chargeCents).toBe(5000);
  });

  it("só aceita plano mais caro (preço igual ou menor é erro de programação, não cobrança negativa)", () => {
    expect(() => prorateUpgrade(9990, 9990, end)).toThrow(RangeError);
    expect(() => prorateUpgrade(9990, 4990, end)).toThrow(RangeError);
    expect(() => prorateUpgrade(9990, Number.NaN, end)).toThrow(RangeError);
  });

  it("dias restantes arredondam para cima (para explicar o valor na tela)", () => {
    expect(prorateUpgrade(4990, 9990, end, new Date(end.getTime() - DAYS(10) - 1000)).remainingDays).toBe(11);
    expect(prorateUpgrade(4990, 9990, end, new Date(end.getTime() + DAYS(1))).remainingDays).toBe(0);
  });
});

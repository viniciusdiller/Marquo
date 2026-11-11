import { anyBlockOverlaps, blocksTouchingWhere, occurrencesInRange } from "./time-block-occurrences";

// Horários em America/Sao_Paulo (UTC-3, sem horário de verão): 12:00 local = 15:00Z.
const at = (iso: string) => new Date(iso);
const lunch = (extra: object = {}) => ({
  startAt: at("2026-11-16T15:00:00.000Z"), // seg 12:00
  endAt: at("2026-11-16T16:00:00.000Z"), // seg 13:00
  recurrence: "DAILY" as const,
  repeatUntil: null,
  ...extra,
});

describe("occurrencesInRange", () => {
  it("bloqueio único devolve ele mesmo só se tocar o intervalo", () => {
    const single = { startAt: at("2026-11-16T15:00:00.000Z"), endAt: at("2026-11-16T16:00:00.000Z") };
    expect(occurrencesInRange(single, at("2026-11-16T00:00:00.000Z"), at("2026-11-17T00:00:00.000Z"))).toHaveLength(1);
    expect(occurrencesInRange(single, at("2026-11-17T03:00:00.000Z"), at("2026-11-18T03:00:00.000Z"))).toHaveLength(0);
  });

  it("diário repete a mesma janela de hora em cada dia do intervalo", () => {
    const days = occurrencesInRange(lunch(), at("2026-11-16T03:00:00.000Z"), at("2026-11-19T03:00:00.000Z"));
    expect(days.map((d) => d.startAt.toISOString())).toEqual([
      "2026-11-16T15:00:00.000Z",
      "2026-11-17T15:00:00.000Z",
      "2026-11-18T15:00:00.000Z",
    ]);
    expect(days[1].endAt.toISOString()).toBe("2026-11-17T16:00:00.000Z");
  });

  it("não existe antes do dia em que o bloqueio começa", () => {
    expect(occurrencesInRange(lunch(), at("2026-11-10T03:00:00.000Z"), at("2026-11-12T03:00:00.000Z"))).toHaveLength(0);
  });

  it("respeita a data final (inclusive) e depois dela não bloqueia mais", () => {
    const block = lunch({ repeatUntil: at("2026-11-17T00:00:00.000Z") });
    const days = occurrencesInRange(block, at("2026-11-16T03:00:00.000Z"), at("2026-11-21T03:00:00.000Z"));
    expect(days.map((d) => d.startAt.toISOString())).toEqual(["2026-11-16T15:00:00.000Z", "2026-11-17T15:00:00.000Z"]);
  });

  it("só devolve a ocorrência que de fato toca a janela pedida", () => {
    // Pede 14:00-14:30 locais (17:00Z-17:30Z): o almoço 12-13 não toca.
    expect(occurrencesInRange(lunch(), at("2026-11-17T17:00:00.000Z"), at("2026-11-17T17:30:00.000Z"))).toHaveLength(0);
    // Pede 12:30-13:30 locais: toca.
    expect(occurrencesInRange(lunch(), at("2026-11-17T15:30:00.000Z"), at("2026-11-17T16:30:00.000Z"))).toHaveLength(1);
  });

  it("um intervalo absurdo não trava (teto de dias percorridos)", () => {
    const many = occurrencesInRange(lunch(), at("2026-11-16T03:00:00.000Z"), at("2036-11-16T03:00:00.000Z"));
    expect(many.length).toBeLessThanOrEqual(400);
  });
});

describe("anyBlockOverlaps", () => {
  it("o almoço diário bloqueia 12:30 num dia futuro, mas não 13:00", () => {
    expect(anyBlockOverlaps([lunch()], at("2026-12-02T15:30:00.000Z"), at("2026-12-02T16:30:00.000Z"))).toBe(true);
    expect(anyBlockOverlaps([lunch()], at("2026-12-02T16:00:00.000Z"), at("2026-12-02T17:00:00.000Z"))).toBe(false);
  });
});

describe("blocksTouchingWhere", () => {
  it("traz os únicos que se sobrepõem e os diários já iniciados, sem fim ou com fim a partir do dia", () => {
    const where = blocksTouchingWhere(at("2026-11-17T03:00:00.000Z"), at("2026-11-18T03:00:00.000Z"));
    expect(where.OR).toHaveLength(2);
    const [single, daily] = where.OR as unknown as Array<Record<string, unknown>>;
    expect(single.recurrence).toBe("NONE");
    expect(daily.recurrence).toBe("DAILY");
    expect(daily.OR).toEqual([{ repeatUntil: null }, { repeatUntil: { gte: new Date("2026-11-17T00:00:00.000Z") } }]);
  });
});

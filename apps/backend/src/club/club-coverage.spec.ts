import { computeCoverage, NO_COVERAGE, type CoverageItem } from "./club-coverage";

const at = (n: number) => new Date(Date.UTC(2026, 10, 10, 12, n));
function item(over: Partial<CoverageItem> & { id: string }): CoverageItem {
  return { kind: "SERVICE", serviceId: "corte", quantity: 1, unitPriceCents: 5000, createdAt: at(0), ...over };
}
const ELIGIBLE = new Set(["corte", "barba"]);

describe("computeCoverage", () => {
  it("cobre o serviço do pacote enquanto houver uso", () => {
    const r = computeCoverage([item({ id: "a" })], ELIGIBLE, 4);
    expect(r).toEqual({ coveredCents: 5000, lines: [{ itemId: "a", units: 1, coveredCents: 5000 }] });
  });

  it("sem uso restante não cobre nada", () => {
    expect(computeCoverage([item({ id: "a" })], ELIGIBLE, 0)).toEqual(NO_COVERAGE);
    expect(computeCoverage([item({ id: "a" })], ELIGIBLE, -3)).toEqual(NO_COVERAGE);
  });

  it("cada UNIDADE gasta um uso: quantidade maior que o saldo cobre só o que resta", () => {
    const r = computeCoverage([item({ id: "a", quantity: 3, unitPriceCents: 4000 })], ELIGIBLE, 2);
    expect(r.lines).toEqual([{ itemId: "a", units: 2, coveredCents: 8000 }]);
    expect(r.coveredCents).toBe(8000);
  });

  it("segue a ordem em que os itens foram lançados e para quando o saldo acaba", () => {
    const r = computeCoverage(
      [
        item({ id: "tarde", createdAt: at(30), unitPriceCents: 9000 }),
        item({ id: "cedo", createdAt: at(1), unitPriceCents: 3000 }),
        item({ id: "meio", createdAt: at(10), unitPriceCents: 6000 }),
      ],
      ELIGIBLE,
      2,
    );
    expect(r.lines.map((l) => l.itemId)).toEqual(["cedo", "meio"]);
    expect(r.coveredCents).toBe(9000);
  });

  it("desempate estável por id quando criados no mesmo instante", () => {
    const r = computeCoverage([item({ id: "b" }), item({ id: "a" })], ELIGIBLE, 1);
    expect(r.lines.map((l) => l.itemId)).toEqual(["a"]);
  });

  // Segurança/dinheiro: só serviço DO pacote. Produto, item avulso e serviço fora do pacote nunca são cobertos.
  it("não cobre produto, item avulso nem serviço fora do pacote", () => {
    const r = computeCoverage(
      [
        item({ id: "prod", kind: "PRODUCT", serviceId: null }),
        item({ id: "avulso", kind: "CUSTOM", serviceId: null }),
        item({ id: "fora", serviceId: "sobrancelha" }),
        item({ id: "dentro", serviceId: "barba" }),
      ],
      ELIGIBLE,
      10,
    );
    expect(r.lines.map((l) => l.itemId)).toEqual(["dentro"]);
  });

  it("item de serviço sem serviceId (dado inconsistente) nunca é coberto", () => {
    expect(computeCoverage([item({ id: "a", serviceId: null })], ELIGIBLE, 5)).toEqual(NO_COVERAGE);
  });

  it("saldo fracionário é truncado e quantidade negativa/zero não cobre", () => {
    expect(computeCoverage([item({ id: "a", quantity: 2 })], ELIGIBLE, 1.9).coveredCents).toBe(5000);
    expect(computeCoverage([item({ id: "a", quantity: 0 })], ELIGIBLE, 3)).toEqual({ coveredCents: 0, lines: [] });
    expect(computeCoverage([item({ id: "a", quantity: -2 })], ELIGIBLE, 3)).toEqual({ coveredCents: 0, lines: [] });
  });

  it("comanda sem itens ou pacote sem serviços não cobre", () => {
    expect(computeCoverage([], ELIGIBLE, 3)).toEqual(NO_COVERAGE);
    expect(computeCoverage([item({ id: "a" })], new Set(), 3)).toEqual({ coveredCents: 0, lines: [] });
  });
});

// @Type() (class-transformer) precisa do polyfill de metadata — os outros specs de DTO no
// projeto não usam @Type(), só este.
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SearchMarketplaceQueryDto } from "./search-marketplace-query.dto";

// Regressão: o controller antes fazia Number(query.lat) sem checagem nenhuma — NaN,
// Infinity ou latitude/longitude fora de faixa iam direto pro WHERE do Prisma.
async function errorsFor(plain: Record<string, unknown>) {
  const dto = plainToInstance(SearchMarketplaceQueryDto, plain);
  return validate(dto);
}

describe("SearchMarketplaceQueryDto", () => {
  it("aceita busca vazia (todos os campos opcionais)", async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it("aceita lat/lng/radiusKm válidos (query string vira número via @Type)", async () => {
    const errors = await errorsFor({ lat: "-23.55", lng: "-46.63", radiusKm: "10" });
    expect(errors).toHaveLength(0);
  });

  it("rejeita latitude fora de -90..90", async () => {
    const errors = await errorsFor({ lat: "999", lng: "-46.63" });
    expect(errors.some((e) => e.property === "lat")).toBe(true);
  });

  it("rejeita lat não-numérico", async () => {
    const errors = await errorsFor({ lat: "abc", lng: "-46.63" });
    expect(errors.some((e) => e.property === "lat")).toBe(true);
  });

  it("rejeita radiusKm negativo/zero", async () => {
    const errors = await errorsFor({ radiusKm: "0" });
    expect(errors.some((e) => e.property === "radiusKm")).toBe(true);
  });

  it("rejeita q acima do teto de tamanho", async () => {
    const errors = await errorsFor({ q: "a".repeat(101) });
    expect(errors.some((e) => e.property === "q")).toBe(true);
  });

  it("aceita sort válido e limit dentro da faixa", async () => {
    expect(await errorsFor({ sort: "rating", limit: "8" })).toHaveLength(0);
    expect(await errorsFor({ sort: "distance", lat: "-23.55", lng: "-46.63" })).toHaveLength(0);
  });

  it("rejeita sort desconhecido (vazaria direto para a ordenação)", async () => {
    const errors = await errorsFor({ sort: "name; DROP TABLE" });
    expect(errors.some((e) => e.property === "sort")).toBe(true);
  });

  it("rejeita limit fora de 1..50", async () => {
    expect((await errorsFor({ limit: "0" })).some((e) => e.property === "limit")).toBe(true);
    expect((await errorsFor({ limit: "51" })).some((e) => e.property === "limit")).toBe(true);
    expect((await errorsFor({ limit: "2.5" })).some((e) => e.property === "limit")).toBe(true);
  });
});

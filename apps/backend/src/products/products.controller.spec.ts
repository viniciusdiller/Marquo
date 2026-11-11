import "reflect-metadata";
import { ProductsController } from "./products.controller";
import { areaOf, rolesOf } from "../access/area-metadata";

// Produtos é uma área dos perfis de acesso: ver o catálogo e o estoque pede "ver"; criar, editar e ajustar estoque pede "editar"
// (o nível sai do método HTTP). Não há mais papel fixo na rota: quem decide é o perfil.
describe("ProductsController: quem pode chamar o quê", () => {
  it.each(["list", "detail", "movements", "create", "update", "adjustStock"] as const)("%s pertence à área produtos", (handler) => {
    expect(areaOf(ProductsController, handler)).toMatchObject({ area: "produtos" });
    expect(areaOf(ProductsController, handler)?.level).toBeUndefined(); // nível pelo método HTTP: GET ver, demais editar
  });

  it.each(["list", "detail", "movements", "create", "update", "adjustStock"] as const)("%s não tem papel fixo", (handler) => {
    expect(rolesOf(ProductsController, handler)).toBeUndefined();
  });
});

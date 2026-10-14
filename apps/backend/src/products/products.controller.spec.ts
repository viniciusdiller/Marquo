import "reflect-metadata";
import { Role } from "@marquo/database";
import { ProductsController } from "./products.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";

const proto = ProductsController.prototype;
const methodRoles = (handler: keyof ProductsController) => Reflect.getMetadata(ROLES_KEY, proto[handler]);

describe("ProductsController: quem pode chamar o quê", () => {
  it("a classe toda exige OWNER ou RECEPTIONIST (PROFESSIONAL não mexe em catálogo/estoque)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProductsController)).toEqual([Role.OWNER, Role.RECEPTIONIST]);
  });

  it.each(["create", "update"] as const)("%s restringe além da classe: só OWNER (catálogo é decisão do dono)", (handler) => {
    expect(methodRoles(handler)).toEqual([Role.OWNER]);
  });

  it.each(["list", "detail", "movements", "adjustStock"] as const)(
    "%s não restringe no handler — herda OWNER+RECEPTIONIST da classe",
    (handler) => {
      expect(methodRoles(handler)).toBeUndefined();
    },
  );
});

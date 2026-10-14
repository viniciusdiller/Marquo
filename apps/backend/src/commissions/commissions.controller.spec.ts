import "reflect-metadata";
import { Role } from "@marquo/database";
import { CommissionsController } from "./commissions.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";

const proto = CommissionsController.prototype;
const meta = (handler: keyof CommissionsController) => Reflect.getMetadata(ROLES_KEY, proto[handler]);

describe("CommissionsController: quem pode chamar o quê", () => {
  it.each(["listRules", "createRule", "updateRule", "deleteRule"] as const)("%s exige OWNER (regra de comissão é decisão do dono)", (handler) => {
    expect(meta(handler)).toEqual([Role.OWNER]);
  });

  // Aberto a todo staff porque o próprio escopo (PROFESSIONAL só vê o seu) é forçado
  // dentro de CommissionsService.report, não por role fixo aqui — ver commissions.service.spec.ts.
  it("report não tem role fixo — o escopo é aplicado no service", () => {
    expect(meta("report")).toBeUndefined();
  });
});

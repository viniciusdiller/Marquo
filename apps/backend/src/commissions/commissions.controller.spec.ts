import "reflect-metadata";
import { CommissionsController } from "./commissions.controller";
import { areaOf, rolesOf } from "../access/area-metadata";


describe("CommissionsController: quem pode chamar o quê", () => {
  // Comissões é uma área dos perfis: ver ganhos e regras pede "ver"; criar, editar e excluir regras pede "editar".
  it.each(["listRules", "createRule", "updateRule", "deleteRule", "report", "earnings"] as const)("%s pertence à área comissoes", (handler) => {
    expect(areaOf(CommissionsController, handler)).toMatchObject({ area: "comissoes" });
    expect(rolesOf(CommissionsController, handler)).toBeUndefined();
  });

  // O escopo (PROFESSIONAL só vê o seu) segue sendo forçado dentro de CommissionsService, não pela área: quem tem
  // acesso à área como profissional continua vendo só os próprios ganhos — ver commissions.service.spec.ts.
});

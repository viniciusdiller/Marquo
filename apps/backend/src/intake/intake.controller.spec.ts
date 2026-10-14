import "reflect-metadata";
import { Role } from "@marquo/database";
import { IntakeFormsController, IntakeResponsesController } from "./intake.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";

const formsProto = IntakeFormsController.prototype;

describe("IntakeFormsController: quem pode chamar o quê", () => {
  it("list não exige role fixo (qualquer staff lê os modelos)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, formsProto.list)).toBeUndefined();
  });

  it.each(["create", "update"] as const)("%s exige OWNER (criar/editar modelo de ficha é decisão do dono)", (handler) => {
    expect(Reflect.getMetadata(ROLES_KEY, formsProto[handler])).toEqual([Role.OWNER]);
  });
});

describe("IntakeResponsesController: quem pode chamar o quê", () => {
  it("a classe exige OWNER, RECEPTIONIST ou PROFESSIONAL (quem atende preenche a resposta)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, IntakeResponsesController)).toEqual([
      Role.OWNER,
      Role.RECEPTIONIST,
      Role.PROFESSIONAL,
    ]);
  });
});

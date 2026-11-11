import "reflect-metadata";
import { IntakeFormsController, IntakeResponsesController } from "./intake.controller";
import { areaOf, rolesOf } from "../access/area-metadata";

describe("IntakeFormsController: quem pode chamar o quê", () => {
  it("list não tem área nem papel fixo (qualquer staff lê os modelos, que o atendimento usa)", () => {
    expect(areaOf(IntakeFormsController, "list")).toBeUndefined();
    expect(rolesOf(IntakeFormsController, "list")).toBeUndefined();
  });

  it.each(["create", "update"] as const)("%s pede 'editar' na área fichas (criar/editar modelo)", (handler) => {
    expect(areaOf(IntakeFormsController, handler)).toEqual({ area: "fichas", level: "EDIT", selfParam: undefined });
    expect(rolesOf(IntakeFormsController, handler)).toBeUndefined();
  });
});

describe("IntakeResponsesController: quem pode chamar o quê", () => {
  // Preencher a ficha do cliente no atendimento pede só "ver" a área Fichas (quem atende precisa preencher sem poder editar os modelos).
  it("submit pede 'ver' na área fichas, mesmo sendo um POST", () => {
    expect(areaOf(IntakeResponsesController, "submit")).toEqual({ area: "fichas", level: "VIEW", selfParam: undefined });
    expect(rolesOf(IntakeResponsesController, "submit")).toBeUndefined();
  });
});

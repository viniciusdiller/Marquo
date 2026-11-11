import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { Role } from "@marquo/database";
import { ProfessionalServicesController, ServicesController } from "./services.controller";
import { areaOf, rolesOf } from "../access/area-metadata";
import type { AuthenticatedUser } from "../auth/types/auth-user";


const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: "u-1",
  tenantId: "t-1",
  role: Role.OWNER,
  ...over,
});

describe("ServicesController / ProfessionalServicesController: quem pode chamar o quê", () => {
  // Criar e editar serviço é "editar" na área servicos (antes só o dono); a lista segue visível a todo staff (os seletores de agenda e
  // comanda dependem dela, e o catálogo é público na página do negócio).
  it.each(["create", "update"] as const)("ServicesController.%s pede 'editar' na área servicos, sem papel fixo", (handler) => {
    expect(areaOf(ServicesController, handler)).toMatchObject({ area: "servicos", level: "EDIT" });
    expect(rolesOf(ServicesController, handler)).toBeUndefined();
  });

  it("ServicesController.findAll não tem área nem papel fixo (visível a todo staff)", () => {
    expect(areaOf(ServicesController, "findAll")).toBeUndefined();
    expect(rolesOf(ServicesController, "findAll")).toBeUndefined();
  });

  it("ProfessionalServicesController.link pede 'editar' em profissionais; list não (restrição é imperativa)", () => {
    expect(areaOf(ProfessionalServicesController, "link")).toMatchObject({ area: "profissionais", level: "EDIT" });
    expect(rolesOf(ProfessionalServicesController, "link")).toBeUndefined();
    expect(areaOf(ProfessionalServicesController, "list")).toBeUndefined();
  });
});

// Regressão: a rota não checava que professionalId era o do próprio chamador quando
// role === PROFESSIONAL — um profissional podia ler o preço/duração negociado de
// qualquer colega. Ver services.controller.ts `list`.
describe("ProfessionalServicesController.list: PROFESSIONAL só vê os próprios serviços vinculados", () => {
  const controller = new ProfessionalServicesController({ listByProfessional: jest.fn() } as never);

  it("PROFESSIONAL pedindo o professionalId de outro colega → ForbiddenException", () => {
    expect(() =>
      controller.list(user({ role: Role.PROFESSIONAL, professionalId: "p-1" }), "p-2"),
    ).toThrow(ForbiddenException);
  });

  it("PROFESSIONAL pedindo o próprio professionalId → não lança", () => {
    expect(() =>
      controller.list(user({ role: Role.PROFESSIONAL, professionalId: "p-1" }), "p-1"),
    ).not.toThrow();
  });

  it("OWNER/RECEPTIONIST podem pedir o de qualquer profissional", () => {
    expect(() => controller.list(user({ role: Role.OWNER }), "p-qualquer")).not.toThrow();
    expect(() => controller.list(user({ role: Role.RECEPTIONIST }), "p-qualquer")).not.toThrow();
  });
});

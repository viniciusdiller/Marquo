import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { Role } from "@marquo/database";
import { ProfessionalServicesController, ServicesController } from "./services.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../auth/types/auth-user";

const servicesProto = ServicesController.prototype;
const professionalServicesProto = ProfessionalServicesController.prototype;
const meta = (proto: object, handler: string) => Reflect.getMetadata(ROLES_KEY, (proto as never)[handler]);

const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: "u-1",
  tenantId: "t-1",
  role: Role.OWNER,
  ...over,
});

describe("ServicesController / ProfessionalServicesController: quem pode chamar o quê", () => {
  it.each(["create", "update"] as const)("ServicesController.%s exige OWNER", (handler) => {
    expect(meta(servicesProto, handler)).toEqual([Role.OWNER]);
  });

  it("ServicesController.findAll não exige role fixo (visível a todo staff)", () => {
    expect(meta(servicesProto, "findAll")).toBeUndefined();
  });

  it("ProfessionalServicesController.link exige OWNER; list não (restrição é imperativa)", () => {
    expect(meta(professionalServicesProto, "link")).toEqual([Role.OWNER]);
    expect(meta(professionalServicesProto, "list")).toBeUndefined();
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

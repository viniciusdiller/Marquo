import "reflect-metadata";
import { Role } from "@marquo/database";
import { ForbiddenException } from "@nestjs/common";
import { ProfessionalsController } from "./professionals.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../auth/types/auth-user";

const proto = ProfessionalsController.prototype;
const meta = (handler: keyof ProfessionalsController) => Reflect.getMetadata(ROLES_KEY, proto[handler]);

const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: "u-1",
  tenantId: "t-1",
  role: Role.OWNER,
  ...over,
});

describe("ProfessionalsController: quem pode chamar o quê", () => {
  it.each(["create", "update", "remove"] as const)("%s exige OWNER", (handler) => {
    expect(meta(handler)).toEqual([Role.OWNER]);
  });

  it("findAll/findOne/setWorkingHours não têm role fixo — a restrição é imperativa (ver spec de findOne/setWorkingHours abaixo e o includeEmail de findAll)", () => {
    expect(meta("findAll")).toBeUndefined();
    expect(meta("findOne")).toBeUndefined();
    expect(meta("setWorkingHours")).toBeUndefined();
  });
});

describe("ProfessionalsController.findOne / setWorkingHours: PROFESSIONAL só acessa o próprio", () => {
  const controller = new ProfessionalsController({
    findOneOrThrow: jest.fn(),
    setWorkingHours: jest.fn(),
  } as never);

  it("findOne: PROFESSIONAL pedindo outro id → ForbiddenException", () => {
    expect(() => controller.findOne(user({ role: Role.PROFESSIONAL, professionalId: "p-1" }), "p-2")).toThrow(
      ForbiddenException,
    );
  });

  it("findOne: PROFESSIONAL pedindo o próprio id → não lança", () => {
    expect(() => controller.findOne(user({ role: Role.PROFESSIONAL, professionalId: "p-1" }), "p-1")).not.toThrow();
  });

  it("setWorkingHours: PROFESSIONAL editando horário de outro → ForbiddenException", () => {
    expect(() =>
      controller.setWorkingHours(user({ role: Role.PROFESSIONAL, professionalId: "p-1" }), "p-2", [] as never),
    ).toThrow(ForbiddenException);
  });
});

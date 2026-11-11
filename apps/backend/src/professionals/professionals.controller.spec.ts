import "reflect-metadata";
import { Role } from "@marquo/database";
import { ForbiddenException } from "@nestjs/common";
import { ProfessionalsController } from "./professionals.controller";
import { areaOf, rolesOf } from "../access/area-metadata";
import type { AuthenticatedUser } from "../auth/types/auth-user";

const meta = (handler: keyof ProfessionalsController) => rolesOf(ProfessionalsController, handler);

const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: "u-1",
  tenantId: "t-1",
  role: Role.OWNER,
  ...over,
});

describe("ProfessionalsController: quem pode chamar o quê", () => {
  // Cadastrar, editar e excluir profissionais é a área "profissionais" com nível "editar" (antes: só o dono).
  it.each(["create", "createSelf", "update", "remove"] as const)("%s pertence à área profissionais (editar), sem papel fixo", (handler) => {
    expect(areaOf(ProfessionalsController, handler)).toMatchObject({ area: "profissionais", level: "EDIT" });
    expect(meta(handler)).toBeUndefined();
  });

  // Foto e horários: quem tem "editar" mexe em qualquer um; cada profissional mexe nos PRÓPRIOS com qualquer perfil (selfParam).
  it.each(["uploadPhoto", "removePhoto", "setWorkingHours"] as const)("%s: área profissionais (editar) OU o próprio profissional", (handler) => {
    expect(areaOf(ProfessionalsController, handler)).toEqual({ area: "profissionais", level: "EDIT", selfParam: "id" });
    expect(meta(handler)).toBeUndefined();
  });

  it("findAll/findOne não têm área nem papel fixo — a restrição é imperativa (ver specs abaixo e o includeEmail de findAll)", () => {
    for (const handler of ["findAll", "findOne"] as const) {
      expect(areaOf(ProfessionalsController, handler)).toBeUndefined();
      expect(meta(handler)).toBeUndefined();
    }
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

describe("ProfessionalsController.createSelf: o dono se cadastra como profissional", () => {
  it("usa o userId e o tenantId do TOKEN (o corpo não tem como apontar para outra conta)", () => {
    const createForOwner = jest.fn();
    const controller = new ProfessionalsController({ createForOwner } as never);
    const dto = { serviceIds: ["s-1"] };

    controller.createSelf(user({ userId: "dono-1", tenantId: "t-9" }), dto as never);

    expect(createForOwner).toHaveBeenCalledWith("t-9", "dono-1", dto);
  });
});

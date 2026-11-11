import "reflect-metadata";
import { Role } from "@marquo/database";
import { ClubController } from "./club.controller";
import { areaOf, rolesOf } from "../access/area-metadata";
import type { AuthenticatedUser } from "../auth/types/auth-user";

const user: AuthenticatedUser = { userId: "u-1", tenantId: "t-1", role: Role.OWNER };

describe("ClubController", () => {
  // O clube é uma área dos perfis (antes só do dono): o dono libera a quem quiser, no nível "ver" ou "editar".
  it("todas as rotas pertencem à área clube e não têm papel fixo", () => {
    for (const handler of ["overview", "setEnabled", "listPlans", "createPlan", "updatePlan", "listMembers", "enroll", "renew", "cancel"]) {
      expect(areaOf(ClubController as never, handler)).toMatchObject({ area: "clube" });
      expect(rolesOf(ClubController as never, handler)).toBeUndefined();
    }
  });

  it("usa o tenantId e o userId do TOKEN em todas as operações", () => {
    const club = {
      overview: jest.fn(),
      setEnabled: jest.fn(),
      listPlans: jest.fn(),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      listMembers: jest.fn(),
      enroll: jest.fn(),
      renew: jest.fn(),
      cancel: jest.fn(),
    };
    const controller = new ClubController(club as never);
    const dto = { x: 1 } as never;

    controller.overview(user);
    controller.setEnabled(user, { enabled: true });
    controller.listPlans(user);
    controller.createPlan(user, dto);
    controller.updatePlan(user, "p-1", dto);
    controller.listMembers(user, {});
    controller.enroll(user, dto);
    controller.renew(user, "m-1");
    controller.cancel(user, "m-1");

    expect(club.overview).toHaveBeenCalledWith("t-1");
    expect(club.setEnabled).toHaveBeenCalledWith("t-1", true);
    expect(club.listPlans).toHaveBeenCalledWith("t-1");
    expect(club.createPlan).toHaveBeenCalledWith("t-1", dto);
    expect(club.updatePlan).toHaveBeenCalledWith("t-1", "p-1", dto);
    expect(club.listMembers).toHaveBeenCalledWith("t-1", {});
    expect(club.enroll).toHaveBeenCalledWith("t-1", "u-1", dto);
    expect(club.renew).toHaveBeenCalledWith("t-1", "u-1", "m-1");
    expect(club.cancel).toHaveBeenCalledWith("t-1", "m-1");
  });
});

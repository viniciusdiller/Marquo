import "reflect-metadata";
import { Role } from "@marquo/database";
import { PublicWaitlistController, WaitlistController } from "./waitlist.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

const proto = WaitlistController.prototype;

describe("WaitlistController: quem pode chamar o quê", () => {
  it.each(["findAll", "updateStatus"] as const)("%s exige OWNER (só o dono administra a lista de espera)", (handler) => {
    expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toEqual([Role.OWNER]);
  });
});

describe("PublicWaitlistController: entrada pública exige sessão de Consumer, não staff", () => {
  it("create é público (pula os guards de staff) e usa o guard próprio do Consumer", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicWaitlistController.prototype.create)).toBe(true);
  });
});

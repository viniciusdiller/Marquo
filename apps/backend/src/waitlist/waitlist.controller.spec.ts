import "reflect-metadata";
import { PublicWaitlistController, WaitlistController } from "./waitlist.controller";
import { areaOf, rolesOf } from "../access/area-metadata";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

describe("WaitlistController: quem pode chamar o quê", () => {
  // Lista de espera virou uma área dos perfis (antes só o dono): ver a lista pede "ver"; dar andamento pede "editar".
  it.each(["findAll", "counts", "updateStatus"] as const)("%s pertence à área lista_espera e não tem papel fixo", (handler) => {
    expect(areaOf(WaitlistController, handler)).toMatchObject({ area: "lista_espera" });
    expect(rolesOf(WaitlistController, handler)).toBeUndefined();
  });
});

describe("PublicWaitlistController: entrada pública exige sessão de Consumer, não staff", () => {
  it("create é público (pula os guards de staff) e usa o guard próprio do Consumer", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicWaitlistController.prototype.create)).toBe(true);
  });
});

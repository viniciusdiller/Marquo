import "reflect-metadata";
import { Role } from "@marquo/database";
import { TenantsController } from "./tenants.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

const proto = TenantsController.prototype;
const meta = (handler: keyof TenantsController) => Reflect.getMetadata(ROLES_KEY, proto[handler]);

describe("TenantsController: quem pode chamar o quê", () => {
  it.each([
    "updateMe",
    "updateMarketplace",
    "uploadLogo",
    "removeLogo",
    "uploadGalleryImage",
    "removeGalleryImage",
  ] as const)("%s exige OWNER (dados públicos do negócio são decisão do dono)", (handler) => {
    expect(meta(handler)).toEqual([Role.OWNER]);
  });

  it("getMe/getMarketplace não exigem role fixo (qualquer staff logado lê)", () => {
    expect(meta("getMe")).toBeUndefined();
    expect(meta("getMarketplace")).toBeUndefined();
  });

  it("getPublicBySlug é público", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.getPublicBySlug)).toBe(true);
  });
});

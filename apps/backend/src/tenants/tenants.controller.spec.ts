import "reflect-metadata";
import { Role } from "@marquo/database";
import { TenantsController } from "./tenants.controller";
import { areaOf, rolesOf } from "../access/area-metadata";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

const proto = TenantsController.prototype;
const meta = (handler: keyof TenantsController) => rolesOf(TenantsController, handler);

describe("TenantsController: quem pode chamar o quê", () => {
  it.each([
    "updateMe",
    "getSetupStatus",
    "uploadLogo",
    "removeLogo",
    "uploadGalleryImage",
    "removeGalleryImage",
  ] as const)("%s exige OWNER (dados públicos do negócio são decisão do dono)", (handler) => {
    expect(meta(handler)).toEqual([Role.OWNER]);
  });

  // Marketplace (aparecer na busca, localização) é uma área dos perfis: o dono pode delegar. O resto do perfil do negócio
  // (dados, logo, galeria) segue só do dono.
  it("updateMarketplace pertence à área marketplace e não tem papel fixo", () => {
    expect(areaOf(TenantsController, "updateMarketplace")).toMatchObject({ area: "marketplace", level: "EDIT" });
    expect(meta("updateMarketplace")).toBeUndefined();
  });

  it("getMe/getMarketplace não exigem role fixo (qualquer staff logado lê)", () => {
    expect(meta("getMe")).toBeUndefined();
    expect(meta("getMarketplace")).toBeUndefined();
  });

  it("getPublicBySlug é público", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.getPublicBySlug)).toBe(true);
  });
});

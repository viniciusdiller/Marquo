import "reflect-metadata";
import { ConsumerReviewsController, OwnerReviewsController } from "./reviews.controller";
import { areaOf, rolesOf } from "../access/area-metadata";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

describe("OwnerReviewsController: moderação é da área marketplace", () => {
  it("list/hide/report pertencem à área marketplace (ver lista, editar para ocultar/denunciar), sem papel fixo", () => {
    for (const handler of ["list", "hide", "report"]) {
      expect(areaOf(OwnerReviewsController as never, handler)).toMatchObject({ area: "marketplace" });
      expect(rolesOf(OwnerReviewsController as never, handler)).toBeUndefined();
    }
  });
});

describe("ConsumerReviewsController: rotas do cliente final, não do staff", () => {
  it("pending/create são públicas (protegidas pelo guard próprio do Consumer, não @Roles de staff)", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ConsumerReviewsController.prototype.pending)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ConsumerReviewsController.prototype.create)).toBe(true);
  });
});

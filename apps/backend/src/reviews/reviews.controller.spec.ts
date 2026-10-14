import "reflect-metadata";
import { Role } from "@marquo/database";
import { ConsumerReviewsController, OwnerReviewsController } from "./reviews.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

describe("OwnerReviewsController: moderação exige OWNER", () => {
  it("a classe toda (list/hide/report) exige OWNER", () => {
    expect(Reflect.getMetadata(ROLES_KEY, OwnerReviewsController)).toEqual([Role.OWNER]);
  });
});

describe("ConsumerReviewsController: rotas do cliente final, não do staff", () => {
  it("pending/create são públicas (protegidas pelo guard próprio do Consumer, não @Roles de staff)", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ConsumerReviewsController.prototype.pending)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ConsumerReviewsController.prototype.create)).toBe(true);
  });
});

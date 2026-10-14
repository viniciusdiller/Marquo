import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { BillingService } from "./billing.service";
import { CheckoutService } from "./checkout.service";
import { PlanChangeService } from "./plan-change.service";
import { ChangePlanDto, CreateCheckoutDto, PreviewChangePlanQueryDto } from "./dto/billing.dto";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { SkipBillingCheck } from "../common/decorators/skip-billing-check.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

// Rotas que falam com o Stripe (custam chamada externa e criam objetos lá): limite bem abaixo do
// global. Todas exigem OWNER e funcionam mesmo com o acesso bloqueado (@SkipBillingCheck): quem
// está bloqueado precisa justamente delas para pagar.
export const BILLING_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly checkoutService: CheckoutService,
    private readonly planChangeService: PlanChangeService,
  ) {}

  @Public()
  @Get("plans")
  listPlans() {
    return this.billingService.listPlans();
  }

  @SkipBillingCheck()
  @Get("billing/status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getTenantBillingStatus(user.tenantId);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(BILLING_THROTTLE)
  @HttpCode(200)
  @Post("billing/checkout")
  createCheckout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCheckoutDto) {
    return this.checkoutService.createCheckout(user, dto.tier);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(BILLING_THROTTLE)
  @HttpCode(200)
  @Post("billing/portal")
  createPortal(@CurrentUser() user: AuthenticatedUser) {
    return this.checkoutService.createPortal(user);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(BILLING_THROTTLE)
  @Get("billing/change-plan/preview")
  previewChangePlan(@CurrentUser() user: AuthenticatedUser, @Query() query: PreviewChangePlanQueryDto) {
    return this.planChangeService.preview(user.tenantId, query.tier);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(BILLING_THROTTLE)
  @HttpCode(200)
  @Post("billing/change-plan")
  changePlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    return this.planChangeService.change(user.tenantId, dto);
  }
}

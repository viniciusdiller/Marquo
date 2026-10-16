import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { Roles } from "../../common/decorators/roles.decorator";
import { SkipBillingCheck } from "../../common/decorators/skip-billing-check.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/types/auth-user";
import { ChangePlanDto, CheckoutDto } from "../dto/checkout.dto";
import { PaymentsService } from "./payments.service";

// Rotas do OWNER, que funcionam mesmo com o acesso bloqueado (@SkipBillingCheck): quem está bloqueado precisa
// justamente delas para pagar. Criam objetos no provedor: limite bem abaixo do global.
const START_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
// A tela consulta o Pix a cada poucos segundos até confirmar.
const POLL_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@Controller("billing")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(START_THROTTLE)
  @HttpCode(200)
  @Post("quote")
  quote(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.payments.quote(user.tenantId, dto.tier, dto.couponCode);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(START_THROTTLE)
  @HttpCode(200)
  @Post("checkout/card")
  card(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.payments.startCard(user.tenantId, user.userId, dto.tier, dto.couponCode);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(START_THROTTLE)
  @HttpCode(200)
  @Post("checkout/pix")
  pix(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.payments.startPix(user.tenantId, user.userId, dto.tier, dto.couponCode);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(POLL_THROTTLE)
  @Get("attempts/:id")
  attempt(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.payments.getAttempt(user.tenantId, id);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(START_THROTTLE)
  @HttpCode(200)
  @Post("sync")
  async sync(@CurrentUser() user: AuthenticatedUser) {
    await this.payments.syncCardForTenant(user.tenantId);
    return { ok: true };
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(START_THROTTLE)
  @HttpCode(200)
  @Post("change-plan")
  changePlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    return this.payments.changePlan(user.tenantId, dto.tier);
  }

  @Roles(Role.OWNER)
  @SkipBillingCheck()
  @Throttle(START_THROTTLE)
  @HttpCode(200)
  @Post("cancel")
  async cancel(@CurrentUser() user: AuthenticatedUser) {
    await this.payments.cancel(user.tenantId);
    return { ok: true };
  }
}

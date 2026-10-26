import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { CurrentPlatformAdmin } from "./decorators/current-platform-admin.decorator";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformCouponsService } from "./platform-coupons.service";
import { TenantDeletionService } from "./tenant-deletion.service";
import { AuthenticatedPlatformAdmin } from "./platform-admin.config";
import {
  CreateCouponDto,
  CreatePlatformTenantDto,
  DeleteTenantDto,
  ExtendTrialDto,
  GrantCourtesyDto,
  PlatformAuditQueryDto,
  PlatformCouponsQueryDto,
  PlatformDeletionQueryDto,
  PlatformLoginDto,
  PlatformSubscriptionsQueryDto,
  PlatformTenantsQueryDto,
  PlatformUsersQueryDto,
  PlatformVerifyCodeDto,
  SuspendTenantDto,
  UpdateCouponDto,
  UpdateOwnerPhoneDto,
} from "./dto/platform-admin.dto";

// @Public() só pula o pipeline de STAFF (JwtAuthGuard → RolesGuard → TenantBillingGuard); a
// autenticação real destas rotas é o PlatformAdminGuard, aplicado em cada uma. O login fica de fora
// do guard por ser a rota que o emite.
@Public()
@Controller("platform")
export class PlatformAdminController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly platform: PlatformAdminService,
    private readonly coupons: PlatformCouponsService,
    private readonly deletion: TenantDeletionService,
  ) {}

  @Post("auth/login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: PlatformLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // Segunda etapa do login (só existe com PLATFORM_ADMIN_2FA=email): troca o código recebido por e-mail pela sessão.
  @Post("auth/verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() dto: PlatformVerifyCodeDto) {
    return this.auth.verifyCode(dto.challengeId, dto.code);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("me")
  me(@CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return { email: admin.email };
  }

  @UseGuards(PlatformAdminGuard)
  @Get("overview")
  overview() {
    return this.platform.overview();
  }

  @UseGuards(PlatformAdminGuard)
  @Get("tenants")
  tenants(@Query() query: PlatformTenantsQueryDto) {
    return this.platform.listTenants(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("tenants")
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createTenant(@Body() dto: CreatePlatformTenantDto, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.platform.createTenant(dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("tenants/:id")
  tenant(@Param("id", ParseUUIDPipe) id: string) {
    return this.platform.getTenant(id);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("tenants/:id/suspend")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  suspend(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SuspendTenantDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.platform.suspend(id, dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("tenants/:id/reactivate")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reactivate(@Param("id", ParseUUIDPipe) id: string, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.platform.reactivate(id, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("tenants/:id/extend-trial")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  extendTrial(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ExtendTrialDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.platform.extendTrial(id, dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Put("tenants/:id/courtesy")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  grantCourtesy(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GrantCourtesyDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.platform.grantCourtesy(id, dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Delete("tenants/:id/courtesy")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  removeCourtesy(@Param("id", ParseUUIDPipe) id: string, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.platform.removeCourtesy(id, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Put("tenants/:id/owner-phone")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateOwnerPhone(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerPhoneDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.platform.updateOwnerPhone(id, dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("tenants/:id/password-reset-link")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  passwordResetLink(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.platform.createPasswordResetLink(id, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("users")
  users(@Query() query: PlatformUsersQueryDto) {
    return this.platform.listUsers(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("subscriptions")
  subscriptions(@Query() query: PlatformSubscriptionsQueryDto) {
    return this.platform.listSubscriptions(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("coupons")
  listCoupons(@Query() query: PlatformCouponsQueryDto) {
    return this.coupons.list(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("coupons")
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createCoupon(@Body() dto: CreateCouponDto, @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return this.coupons.create(dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch("coupons/:id")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  updateCoupon(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.coupons.update(id, dto, admin.email);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("audit")
  audit(@Query() query: PlatformAuditQueryDto) {
    return this.platform.listAudit(query);
  }

  // ───────── Exclusão de dados (promessa dos termos: 90 dias depois do fim do acesso) ─────────
  // Nada é apagado sozinho: lista, simulação e uma ação confirmada, sempre com auditoria.

  @UseGuards(PlatformAdminGuard)
  @Get("deletion/candidates")
  deletionCandidates(@Query() query: PlatformDeletionQueryDto) {
    return this.deletion.listCandidates(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Get("tenants/:id/deletion-preview")
  deletionPreview(@Param("id", ParseUUIDPipe) id: string) {
    return this.deletion.preview(id);
  }

  @UseGuards(PlatformAdminGuard)
  @Post("tenants/:id/delete")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  deleteTenantData(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DeleteTenantDto,
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
  ) {
    return this.deletion.purge(id, dto, admin.email);
  }
}

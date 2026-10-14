import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@marquo/database";
import { CommissionsService } from "./commissions.service";
import { UpsertCommissionRuleDto } from "./dto/upsert-commission-rule.dto";
import { RangeByProfessionalQueryDto } from "../common/dto/query-dtos";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller("commissions")
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Roles(Role.OWNER)
  @Get("rules")
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.commissions.listRules(user.tenantId);
  }

  @Roles(Role.OWNER)
  @Post("rules")
  createRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCommissionRuleDto) {
    return this.commissions.createRule(user.tenantId, dto);
  }

  @Roles(Role.OWNER)
  @Patch("rules/:id")
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpsertCommissionRuleDto,
  ) {
    return this.commissions.updateRule(user.tenantId, id, dto);
  }

  @Roles(Role.OWNER)
  @Delete("rules/:id")
  deleteRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.commissions.deleteRule(user.tenantId, id);
  }

  // PROFESSIONAL vê só o próprio; OWNER/RECEPTIONIST veem todos. O filtro é forçado dentro
  // do CommissionsService.report (não aqui), pra valer mesmo se outro caller chamar o
  // service direto no futuro.
  @Get("report")
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RangeByProfessionalQueryDto,
  ) {
    return this.commissions.report(user.tenantId, query.from, query.to, query.professionalId, {
      role: user.role,
      professionalId: user.professionalId,
    });
  }

  // Faturamento bruto/líquido, repasse e saldo por profissional, sem passo de "fechar período".
  // Mesmo escopo do report: o service força o filtro quando o chamador é PROFESSIONAL.
  @Get("earnings")
  earnings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RangeByProfessionalQueryDto,
  ) {
    return this.commissions.earnings(user.tenantId, query.from, query.to, query.professionalId, {
      role: user.role,
      professionalId: user.professionalId,
    });
  }
}

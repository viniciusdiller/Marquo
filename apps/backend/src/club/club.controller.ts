import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { ClubService } from "./club.service";
import { Area } from "../access/area.decorator";
import {
  CreateClubPlanDto,
  EnrollClubMemberDto,
  FindClubMembersQueryDto,
  SetClubEnabledDto,
  UpdateClubPlanDto,
} from "./dto/club.dto";

// Clube de assinaturas: só o DONO gerencia (valores, adesões e receita). O tenantId vem sempre do token. A baixa dos usos
// não passa por aqui: acontece sozinha no fechamento da comanda (TicketsService), para qualquer papel que feche a comanda.
@Area("clube")
@Controller("club")
export class ClubController {
  constructor(private readonly club: ClubService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.club.overview(user.tenantId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch()
  setEnabled(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetClubEnabledDto) {
    return this.club.setEnabled(user.tenantId, dto.enabled);
  }

  @Get("plans")
  listPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.club.listPlans(user.tenantId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("plans")
  createPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClubPlanDto) {
    return this.club.createPlan(user.tenantId, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Patch("plans/:id")
  updatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateClubPlanDto,
  ) {
    return this.club.updatePlan(user.tenantId, id, dto);
  }

  @Get("members")
  listMembers(@CurrentUser() user: AuthenticatedUser, @Query() query: FindClubMembersQueryDto) {
    return this.club.listMembers(user.tenantId, query);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("members")
  enroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnrollClubMemberDto) {
    return this.club.enroll(user.tenantId, user.userId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("members/:id/renew")
  renew(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.club.renew(user.tenantId, user.userId, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("members/:id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.club.cancel(user.tenantId, id);
  }
}

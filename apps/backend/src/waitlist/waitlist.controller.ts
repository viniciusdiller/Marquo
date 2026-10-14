import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { WaitlistService } from "./waitlist.service";
import { CreateWaitlistEntryDto } from "./dto/create-waitlist-entry.dto";
import { UpdateWaitlistStatusDto } from "./dto/update-waitlist-status.dto";
import { FindWaitlistQueryDto } from "./dto/find-waitlist-query.dto";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { ConsumerJwtAuthGuard } from "../consumer-auth/guards/consumer-jwt-auth.guard";
import { CurrentConsumer } from "../consumer-auth/decorators/current-consumer.decorator";
import { AuthenticatedConsumer } from "../consumer-auth/types/consumer-auth-user";

@Controller("public/tenants/:slug/waitlist")
export class PublicWaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  // Exige sessão de Consumer (mesmo modelo do agendamento): nome/telefone do cliente vêm da
  // identidade autenticada, não do body. Mantém o mesmo limite das outras rotas públicas de
  // escrita pra não virar vetor de flood na tabela de espera.
  @Public()
  @UseGuards(ConsumerJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(
    @Param("slug") slug: string,
    @Body() dto: CreateWaitlistEntryDto,
    @CurrentConsumer() consumer: AuthenticatedConsumer,
  ) {
    return this.waitlistService.createFromPublicLink(slug, dto, consumer);
  }
}

@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Roles(Role.OWNER)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindWaitlistQueryDto) {
    return this.waitlistService.findAllByTenant(user.tenantId, query.status);
  }

  @Roles(Role.OWNER)
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateWaitlistStatusDto,
  ) {
    return this.waitlistService.updateStatus(user.tenantId, id, dto.status);
  }
}

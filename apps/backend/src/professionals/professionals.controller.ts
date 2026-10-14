import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Role } from "@marquo/database";
import { ProfessionalsService } from "./professionals.service";
import { CreateProfessionalDto } from "./dto/create-professional.dto";
import { UpdateProfessionalDto } from "./dto/update-professional.dto";
import { SetWorkingHoursDto } from "./dto/set-working-hours.dto";
import { FindPublicProfessionalsQueryDto } from "./dto/find-public-professionals-query.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller("professionals")
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Roles(Role.OWNER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProfessionalDto) {
    return this.professionalsService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.professionalsService.findAllByTenant(user.tenantId, {
      includeEmail: user.role !== Role.PROFESSIONAL,
    });
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (user.role === Role.PROFESSIONAL && user.professionalId !== id) {
      throw new ForbiddenException("Você só pode ver os próprios dados.");
    }
    return this.professionalsService.findOneOrThrow(user.tenantId, id);
  }

  @Roles(Role.OWNER)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProfessionalDto,
  ) {
    return this.professionalsService.update(user.tenantId, id, dto);
  }

  @Roles(Role.OWNER)
  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.professionalsService.remove(user.tenantId, id);
  }

  @Put(":id/working-hours")
  setWorkingHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SetWorkingHoursDto,
  ) {
    if (user.role === Role.PROFESSIONAL && user.professionalId !== id) {
      throw new ForbiddenException("Você só pode editar os próprios horários.");
    }
    return this.professionalsService.setWorkingHours(user.tenantId, id, dto);
  }
}

@Controller("public/tenants/:slug/professionals")
export class PublicProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Public()
  @Get()
  findPublic(@Param("slug") slug: string, @Query() query: FindPublicProfessionalsQueryDto) {
    return this.professionalsService.findPublicByTenantSlugAndService(slug, query.serviceId);
  }

  // Rota separada da acima: essa lista TODOS os profissionais ativos do tenant (pra
  // vitrine "equipe" da página pública), a de cima é filtrada por serviceId (usada pelo
  // wizard de agendamento) — propositalmente não misturadas na mesma rota.
  @Public()
  @Get("team")
  findTeam(@Param("slug") slug: string) {
    return this.professionalsService.findPublicTeamByTenantSlug(slug);
  }
}

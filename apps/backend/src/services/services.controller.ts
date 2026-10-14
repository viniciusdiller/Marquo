import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@marquo/database";
import { ServicesService } from "./services.service";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { LinkProfessionalServiceDto } from "./dto/link-professional-service.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Controller("services")
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Roles(Role.OWNER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.servicesService.findAllByTenant(user.tenantId);
  }

  @Roles(Role.OWNER)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(user.tenantId, id, dto);
  }
}

@Controller("professionals/:professionalId/services")
export class ProfessionalServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Roles(Role.OWNER)
  @Post()
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param("professionalId") professionalId: string,
    @Body() dto: LinkProfessionalServiceDto,
  ) {
    return this.servicesService.linkToProfessional(user.tenantId, professionalId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("professionalId") professionalId: string) {
    if (user.role === Role.PROFESSIONAL && user.professionalId !== professionalId) {
      throw new ForbiddenException("Você só pode ver os próprios serviços.");
    }
    return this.servicesService.listByProfessional(user.tenantId, professionalId);
  }
}

@Controller("public/tenants/:slug/services")
export class PublicServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get()
  findPublic(@Param("slug") slug: string) {
    return this.servicesService.findPublicByTenantSlug(slug);
  }
}

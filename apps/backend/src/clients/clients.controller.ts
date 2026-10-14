import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@marquo/database";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";
import { ClientSearchQueryDto } from "../common/dto/query-dtos";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

// Painel do dono/recepção. PROFESSIONAL não gerencia a base de clientes.
@Roles(Role.OWNER, Role.RECEPTIONIST)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ClientSearchQueryDto) {
    return this.clientsService.list(user.tenantId, query.search);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.clientsService.getDetail(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user.tenantId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user.tenantId, id, dto);
  }
}

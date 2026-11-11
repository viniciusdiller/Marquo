import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";
import { ClientSearchQueryDto } from "../common/dto/query-dtos";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";

import { Area } from "../access/area.decorator";
// Base de clientes: área "clientes". A BUSCA (GET /clients) também serve de seletor em Comandas e no Clube, então quem tem uma dessas
// áreas consegue buscar (só ver). Agenda NÃO entra: o profissional tem agenda e não pode listar a base de clientes. A ficha completa e
// as alterações exigem a área "clientes".
@Area("clientes")
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Area(["clientes", "comandas", "clube"], "VIEW")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ClientSearchQueryDto) {
    return this.clientsService.list(user.tenantId, query);
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

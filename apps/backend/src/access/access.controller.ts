import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@marquo/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { AccessService } from "./access.service";
import {
  CreateAccessProfileDto,
  CreateAccessUserDto,
  ResetAccessUserPasswordDto,
  UpdateAccessProfileDto,
  UpdateAccessUserDto,
} from "./dto/access.dto";

@Controller("access")
export class AccessController {
  constructor(private readonly access: AccessService) {}

  // Qualquer pessoa da equipe vê o PRÓPRIO acesso (o painel usa para montar o menu). Não expõe nada de outras pessoas.
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.access.me(user);
  }

  // Daqui para baixo é SÓ do dono e não é delegável: um perfil nunca consegue se dar mais poder nem mexer em quem tem acesso.
  @Roles(Role.OWNER)
  @Get("profiles")
  listProfiles(@CurrentUser() user: AuthenticatedUser) {
    return this.access.listProfiles(user.tenantId);
  }

  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("profiles")
  createProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccessProfileDto) {
    return this.access.createProfile(user.tenantId, dto);
  }

  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Patch("profiles/:id")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccessProfileDto,
  ) {
    return this.access.updateProfile(user.tenantId, id, dto);
  }

  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete("profiles/:id")
  deleteProfile(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.access.deleteProfile(user.tenantId, id);
  }

  @Roles(Role.OWNER)
  @Get("users")
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.access.listUsers(user.tenantId);
  }

  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("users")
  createUser(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccessUserDto) {
    return this.access.createUser(user.tenantId, dto);
  }

  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Patch("users/:id")
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccessUserDto,
  ) {
    return this.access.updateUser(user.tenantId, id, dto);
  }

  @Roles(Role.OWNER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("users/:id/password")
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResetAccessUserPasswordDto,
  ) {
    return this.access.resetPassword(user.tenantId, id, dto.password);
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@marquo/database";
import { levelAtLeast, type AccessLevel } from "@marquo/shared-types";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { AREA_KEY, AreaRequirement } from "./area.decorator";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requiredLevel(requirement: AreaRequirement, method: string): AccessLevel {
  return requirement.level ?? (READ_METHODS.has(method.toUpperCase()) ? "VIEW" : "EDIT");
}

// Confere o perfil de acesso da pessoa contra a área da rota. Roda DEPOIS do JwtAuthGuard (que carrega o usuário e o perfil do banco a
// cada requisição, então mudar o perfil vale na hora) e do RolesGuard, e ANTES do guard de cobrança.
@Injectable()
export class AreaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<AreaRequirement | undefined>(AREA_KEY, [context.getHandler(), context.getClass()]);
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    // Rota com área sem usuário autenticado (ex.: marcada @Public por engano): nega, nunca libera.
    if (!user) throw new ForbiddenException("Você não tem acesso a esta área.");

    // O dono é sempre total: não existe perfil que o limite.
    if (user.role === Role.OWNER) return true;

    // Autoatendimento: o profissional mexe no que é DELE (foto, horários) com qualquer perfil.
    if (requirement.selfParam && user.professionalId && request.params?.[requirement.selfParam] === user.professionalId) return true;

    const need = requiredLevel(requirement, request.method);
    const areas = Array.isArray(requirement.area) ? requirement.area : [requirement.area];
    if (areas.some((area) => levelAtLeast(user.permissions?.[area], need))) return true;

    throw new ForbiddenException(
      need === "VIEW" ? "Seu perfil não tem acesso a esta área." : "Seu perfil só permite visualizar esta área, não alterar.",
    );
  }
}

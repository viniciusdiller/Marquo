import { Role } from "@marquo/database";
import type { AccessPermissions } from "@marquo/shared-types";

export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  role: Role;
  professionalId?: string;
  iat?: number; // emissão (segundos), preenchido pelo JwtService
}

// Sem `role` de propósito — é o que faz o JwtStrategy (STAFF_ROLES.has(payload.role))
// rejeitar automaticamente um refresh token apresentado como access token.
export interface RefreshTokenPayload {
  sub: string; // userId
  type: "refresh";
  jti?: string; // id da linha em RefreshToken (rotação); ausente = formato antigo, não aceito
  fid?: string; // familyId: um por login, compartilhado pelos tokens derivados
  iat?: number;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: Role;
  professionalId?: string;
  // Nível de acesso por área, lido do PERFIL no banco a cada requisição (nunca das claims do token). O dono é sempre total.
  // O JwtStrategy sempre preenche; ausente (ex.: usuário montado à mão num teste) vale como SEM ACESSO: o AreaGuard nega por padrão.
  permissions?: AccessPermissions;
  profileName?: string | null;
}

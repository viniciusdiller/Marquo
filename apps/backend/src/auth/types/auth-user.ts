import { Role } from "@marquo/database";

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
}

import { createHash, createHmac } from "crypto";
import { ConfigService } from "@nestjs/config";

// A conta da plataforma NÃO está no banco: é definida no .env do backend (PLATFORM_ADMIN_EMAIL +
// PLATFORM_ADMIN_PASSWORD_HASH, um hash bcrypt — nunca a senha em claro). Vantagens: não há linha para
// vazar num dump do banco nem endpoint de cadastro para atacar; trocar a senha é trocar o hash e
// reiniciar (o que também derruba toda sessão antiga, ver `pv`). Sem as duas variáveis o painel fica
// desligado e o login responde 401 a tudo (fail closed).
export interface PlatformAdminCredentials {
  email: string;
  passwordHash: string;
}

export function readPlatformAdmin(config: ConfigService): PlatformAdminCredentials | null {
  const email = config.get<string>("PLATFORM_ADMIN_EMAIL")?.trim().toLowerCase();
  const passwordHash = config.get<string>("PLATFORM_ADMIN_PASSWORD_HASH")?.trim();
  if (!email || !passwordHash) return null;
  return { email, passwordHash };
}

// Chave de assinatura DERIVADA do JWT_SECRET com um rótulo de domínio: um token de staff ou de cliente
// (assinados com o JWT_SECRET puro) nunca verifica aqui, e vice-versa — mesmo se alguém forjar o
// payload `type: "platform"`, falta a chave. Sem variável nova para configurar.
export function platformSigningKey(config: ConfigService): string {
  return createHmac("sha256", config.getOrThrow<string>("JWT_SECRET"))
    .update("marquo.platform-admin.v1")
    .digest("hex");
}

// Prefixo do sha256 do hash da senha: trocar a senha no .env muda este valor e invalida as sessões
// abertas (mesma ideia do `pv` do cliente final). Não expõe o hash.
export function platformPasswordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export interface PlatformJwtPayload {
  sub: "platform-admin";
  type: "platform";
  email: string;
  pv: string;
}

export interface AuthenticatedPlatformAdmin {
  email: string;
}

// Sessão curta e sem refresh: é uma conta que enxerga todos os negócios, então reautenticar a cada
// poucas horas é preferível a um token longevo.
export const PLATFORM_SESSION_SECONDS = 2 * 60 * 60;

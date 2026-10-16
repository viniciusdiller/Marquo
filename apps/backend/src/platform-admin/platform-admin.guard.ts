import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  PlatformJwtPayload,
  platformPasswordVersion,
  platformSigningKey,
  readPlatformAdmin,
} from "./platform-admin.config";

// Guard próprio, fora do pipeline de staff (JwtAuthGuard → RolesGuard → TenantBillingGuard): as rotas
// /platform/* são @Public() para pular aquele pipeline e aplicam este via @UseGuards. Confere:
//  1. assinatura com a chave DERIVADA da plataforma (token de staff/cliente não verifica);
//  2. type === "platform";
//  3. o e-mail do token ainda é o configurado no .env;
//  4. `pv` ainda bate com o hash atual (trocar a senha derruba as sessões);
// e o painel precisa estar configurado. Toda falha devolve a mesma mensagem.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Não autenticado.");

    const admin = readPlatformAdmin(this.config);
    if (!admin) throw new UnauthorizedException("Sessão inválida ou expirada.");

    let payload: PlatformJwtPayload;
    try {
      payload = this.jwt.verify<PlatformJwtPayload>(token, { secret: platformSigningKey(this.config) });
    } catch {
      throw new UnauthorizedException("Sessão inválida ou expirada.");
    }

    if (
      payload.type !== "platform" ||
      payload.sub !== "platform-admin" ||
      payload.email !== admin.email ||
      payload.pv !== platformPasswordVersion(admin.passwordHash)
    ) {
      throw new UnauthorizedException("Sessão inválida ou expirada.");
    }

    request.platformAdmin = { email: admin.email };
    return true;
  }
}

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Role } from "@marquo/database";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload, AuthenticatedUser } from "../types/auth-user";
import { isSessionRevoked } from "../../common/utils/session.util";

const STAFF_ROLES = new Set<string>(Object.values(Role));

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Tokens de cliente (consumer-auth/) são assinados com o mesmo JWT_SECRET mas têm um
    // payload diferente (sem `role`, com `type: "consumer"`) — sem essa checagem, um token
    // de cliente passaria despercebido por qualquer rota de staff sem @Roles() explícito,
    // já que a assinatura por si só é válida.
    if (!STAFF_ROLES.has(payload.role)) {
      throw new UnauthorizedException();
    }

    // Nunca confiar nas claims do token (tenantId/role/professionalId) por até 12h: usuário
    // desativado, removido ou rebaixado continuaria com o acesso antigo. A identidade e as
    // permissões vêm SEMPRE do banco (leitura por PK, barata); o token só prova quem é.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        tenantId: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        passwordChangedAt: true,
        professional: { select: { id: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    // Defesa em profundidade: conta sem e-mail confirmado não tem sessão (o login já barra; isto cobre token emitido por
    // outro caminho).
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException();
    }
    // Senha redefinida depois da emissão deste token: a sessão antiga não vale mais.
    if (isSessionRevoked(payload.iat, user.passwordChangedAt)) {
      throw new UnauthorizedException();
    }

    return {
      userId: payload.sub,
      tenantId: user.tenantId,
      role: user.role,
      professionalId: user.professional?.id,
    };
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SharedStateService } from "../shared-state/shared-state.service";
import type { Request } from "express";
import {
  INTERNAL_MAX_AGE_MS,
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  verifyInternalRequest,
} from "./internal-signature.util";

// Toda falha (sem segredo, sem cabeçalho, assinatura errada, expirada, repetida) responde igual: 403
// genérico. Quem não sabe assinar não descobre por que foi recusado nem se a rota existe de verdade.
const DENIED = "Acesso negado.";

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);
  constructor(private readonly config: ConfigService, private readonly state: SharedStateService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>("INTERNAL_API_SECRET");
    if (!secret) {
      // Sem segredo configurado a API interna simplesmente não existe (fail closed).
      this.logger.warn("INTERNAL_API_SECRET não configurado: API interna desabilitada.");
      throw new ForbiddenException(DENIED);
    }

    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = req.headers[INTERNAL_SIGNATURE_HEADER];
    const valid = verifyInternalRequest(
      { method: req.method, path: req.originalUrl, body: req.rawBody },
      req.headers[INTERNAL_TIMESTAMP_HEADER],
      signature,
      secret,
    );
    if (!valid || typeof signature !== "string") throw new ForbiddenException(DENIED);

    // Include the accepted future skew: a signature remains valid until timestamp + max age.
    const ttl = Math.max(1, Number(req.headers[INTERNAL_TIMESTAMP_HEADER]) + INTERNAL_MAX_AGE_MS - Date.now() + 1);
    if (!(await this.state.claim("internal-replay", signature, ttl))) throw new ForbiddenException(DENIED);
    return true;
  }
}

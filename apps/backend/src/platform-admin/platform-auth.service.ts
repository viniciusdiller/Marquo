import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { lockoutDurationMs, LOCKOUT_THRESHOLD } from "../common/utils/lockout.util";
import {
  PLATFORM_SESSION_SECONDS,
  PlatformJwtPayload,
  platformPasswordVersion,
  platformSigningKey,
  readPlatformAdmin,
} from "./platform-admin.config";

// Hash de uma senha qualquer, só para gastar o MESMO tempo de bcrypt quando o e-mail não é o do admin
// (ou o painel está desligado): sem isso, o tempo de resposta revelaria qual e-mail é o da conta.
// Gerado com o mesmo custo do login de staff/cliente (mesmo padrão de auth.service.ts).
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync("timing-attack-mitigation", BCRYPT_ROUNDS);

const INVALID_MESSAGE = "E-mail ou senha incorretos.";

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  // Lockout em memória (um processo, como o cache de replay da API interna): a conta é única e vive no
  // .env, então não há linha no banco para guardar contador. Só rastreia o e-mail DA conta — um
  // atacante não consegue encher o mapa com e-mails arbitrários.
  private failedAttempts = 0;
  private lockedUntil = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async login(emailInput: string, password: string) {
    const admin = readPlatformAdmin(this.config);
    const email = emailInput.trim().toLowerCase();
    const isAdminEmail = admin !== null && email === admin.email;

    if (isAdminEmail && this.lockedUntil > Date.now()) {
      // Ainda gasta o bcrypt: a resposta de "bloqueado" não pode ser mais rápida que a de senha errada.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException(INVALID_MESSAGE);
    }

    const hash = isAdminEmail ? admin!.passwordHash : DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hash).catch(() => false);

    if (!isAdminEmail || !passwordOk) {
      if (isAdminEmail) this.registerFailure();
      // Mesma mensagem para: painel desligado, e-mail que não é o da conta, senha errada e bloqueio.
      throw new UnauthorizedException(INVALID_MESSAGE);
    }

    this.failedAttempts = 0;
    this.lockedUntil = 0;

    const payload: PlatformJwtPayload = {
      sub: "platform-admin",
      type: "platform",
      email: admin!.email,
      pv: platformPasswordVersion(admin!.passwordHash),
    };
    const accessToken = this.jwt.sign(payload, {
      secret: platformSigningKey(this.config),
      expiresIn: PLATFORM_SESSION_SECONDS,
    });

    // Nunca a senha, o hash ou o token.
    this.logger.log(`Login na plataforma: ${admin!.email}`);
    return { accessToken, expiresInSeconds: PLATFORM_SESSION_SECONDS, email: admin!.email };
  }

  private registerFailure() {
    this.failedAttempts += 1;
    if (this.failedAttempts >= LOCKOUT_THRESHOLD) {
      this.lockedUntil = Date.now() + lockoutDurationMs(this.failedAttempts);
      this.logger.warn(`Conta da plataforma bloqueada após ${this.failedAttempts} falhas.`);
    }
  }
}

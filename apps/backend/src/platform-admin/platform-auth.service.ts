import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { lockoutDurationMs, LOCKOUT_THRESHOLD } from "../common/utils/lockout.util";
import { OneTimeCodeStore, oneTimeCodeSecret } from "../common/utils/one-time-code";
import { EmailService } from "../email/email.service";
import { buildVerificationCodeEmail } from "../email/verification-code.email";
import {
  PLATFORM_SESSION_SECONDS,
  PlatformAdminCredentials,
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
export const TWO_FACTOR_INVALID_MESSAGE = "Código inválido ou expirado.";

// Segundo fator por e-mail: código de 6 dígitos válido por 10 minutos, 5 tentativas por código.
const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
// Só existe UMA conta, então poucos desafios vivos já bastam; o teto limita a memória sob abuso.
const CODE_MAX_ENTRIES = 10;

export interface PlatformSession {
  accessToken: string;
  expiresInSeconds: number;
  email: string;
}

// Com o 2FA ligado, a senha certa NÃO entrega sessão: devolve um desafio (challengeId) e manda o código ao e-mail da conta.
export interface PlatformChallenge {
  requiresCode: true;
  challengeId: string;
  expiresInSeconds: number;
}

export type PlatformLoginResult = PlatformSession | PlatformChallenge;

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  // Lockout em memória (um processo, como o cache de replay da API interna): a conta é única e vive no
  // .env, então não há linha no banco para guardar contador. Só rastreia o e-mail DA conta — um
  // atacante não consegue encher o mapa com e-mails arbitrários.
  private failedAttempts = 0;
  private lockedUntil = 0;

  // Códigos do segundo fator, em memória (um processo): perder um num reinício só obriga a entrar de novo.
  private codeStore: OneTimeCodeStore | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  private get codes(): OneTimeCodeStore {
    this.codeStore ??= new OneTimeCodeStore(oneTimeCodeSecret(this.config.getOrThrow<string>("JWT_SECRET")), {
      ttlMs: CODE_TTL_MS,
      maxAttempts: CODE_MAX_ATTEMPTS,
      maxEntries: CODE_MAX_ENTRIES,
    });
    return this.codeStore;
  }

  private twoFactorEnabled(): boolean {
    return this.config.get<string>("PLATFORM_ADMIN_2FA") === "email";
  }

  async login(emailInput: string, password: string): Promise<PlatformLoginResult> {
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

    // Com 2FA, a senha certa é só a primeira etapa: o contador de falhas NÃO zera aqui (senão quem sabe a senha zeraria o
    // bloqueio a cada tentativa de adivinhar o código). Zera quando o código também confere.
    if (this.twoFactorEnabled()) return this.startChallenge(admin!);

    this.failedAttempts = 0;
    this.lockedUntil = 0;
    return this.issueSession(admin!);
  }

  // Segunda etapa: confere o código do desafio. Erro soma falha do MESMO contador de bloqueio da senha, então adivinhar
  // códigos esbarra no lockout progressivo; o código é de uso único e some depois de 5 erros ou 10 minutos.
  async verifyCode(challengeId: string, code: string): Promise<PlatformSession> {
    const admin = readPlatformAdmin(this.config);
    if (!admin || !this.twoFactorEnabled() || this.lockedUntil > Date.now()) {
      throw new UnauthorizedException(TWO_FACTOR_INVALID_MESSAGE);
    }

    const result = this.codes.check(challengeId, code);
    if (result === "invalid" || result === "locked") this.registerFailure();
    if (result !== "ok") throw new UnauthorizedException(TWO_FACTOR_INVALID_MESSAGE);

    this.codes.consume(challengeId);
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    return this.issueSession(admin);
  }

  private async startChallenge(admin: PlatformAdminCredentials): Promise<PlatformChallenge> {
    const challengeId = randomBytes(24).toString("hex");
    const code = this.codes.issue(challengeId);

    const frontend = (this.config.get<string>("FRONTEND_URL") ?? "").replace(/\/+$/, "");
    const message = buildVerificationCodeEmail({
      title: "Código de acesso à plataforma",
      intro: "Alguém informou a senha da conta da plataforma do Marquo. Use o código abaixo para concluir o acesso.",
      code,
      expiresInMinutes: CODE_TTL_MS / 60_000,
      logoUrl: frontend ? `${frontend}/brand/email/marquo-logo.png` : undefined,
      siteUrl: frontend || undefined,
    });
    const sent = await this.email.send({ to: [admin.email], ...message });
    if (!sent) {
      // Sem o código na caixa o admin não consegue concluir: descarta o desafio e avisa (a senha estava certa).
      this.codes.consume(challengeId);
      throw new ServiceUnavailableException("Não foi possível enviar o código de acesso agora. Tente de novo em instantes.");
    }

    // Nunca o código.
    this.logger.log("Código de acesso à plataforma enviado.");
    return { requiresCode: true, challengeId, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  private issueSession(admin: PlatformAdminCredentials): PlatformSession {
    const payload: PlatformJwtPayload = {
      sub: "platform-admin",
      type: "platform",
      email: admin.email,
      pv: platformPasswordVersion(admin.passwordHash),
    };
    const accessToken = this.jwt.sign(payload, {
      secret: platformSigningKey(this.config),
      expiresIn: PLATFORM_SESSION_SECONDS,
    });

    // Nunca a senha, o hash ou o token.
    this.logger.log(`Login na plataforma: ${admin.email}`);
    return { accessToken, expiresInSeconds: PLATFORM_SESSION_SECONDS, email: admin.email };
  }

  private registerFailure() {
    this.failedAttempts += 1;
    if (this.failedAttempts >= LOCKOUT_THRESHOLD) {
      this.lockedUntil = Date.now() + lockoutDurationMs(this.failedAttempts);
      this.logger.warn(`Conta da plataforma bloqueada após ${this.failedAttempts} falhas.`);
    }
  }
}

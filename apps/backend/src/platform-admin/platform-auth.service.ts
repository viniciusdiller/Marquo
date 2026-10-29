import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { SharedStateService } from "../shared-state/shared-state.service";

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

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly state: SharedStateService,
  ) {}

  private codeScope(admin: PlatformAdminCredentials): string {
    // Changing administrator credentials invalidates outstanding challenges on every replica.
    return `platform-code:${admin.email}:${platformPasswordVersion(admin.passwordHash)}`;
  }

  private twoFactorEnabled(): boolean {
    return this.config.get<string>("PLATFORM_ADMIN_2FA") === "email";
  }

  async login(emailInput: string, password: string): Promise<PlatformLoginResult> {
    const admin = readPlatformAdmin(this.config);
    const email = emailInput.trim().toLowerCase();
    const isAdminEmail = admin !== null && email === admin.email;

    if (isAdminEmail && await this.state.isLocked(admin!.email)) {
      // Ainda gasta o bcrypt: a resposta de "bloqueado" não pode ser mais rápida que a de senha errada.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException(INVALID_MESSAGE);
    }

    const hash = isAdminEmail ? admin!.passwordHash : DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hash).catch(() => false);

    if (!isAdminEmail || !passwordOk) {
      if (isAdminEmail) await this.state.registerFailure(admin!.email);
      // Mesma mensagem para: painel desligado, e-mail que não é o da conta, senha errada e bloqueio.
      throw new UnauthorizedException(INVALID_MESSAGE);
    }

    // Com 2FA, a senha certa é só a primeira etapa: o contador de falhas NÃO zera aqui (senão quem sabe a senha zeraria o
    // bloqueio a cada tentativa de adivinhar o código). Zera quando o código também confere.
    if (this.twoFactorEnabled()) return this.startChallenge(admin!);

    await this.state.clear("platform-lockout", admin!.email);
    return this.issueSession(admin!);
  }

  // Segunda etapa: confere o código do desafio. Erro soma falha do MESMO contador de bloqueio da senha, então adivinhar
  // códigos esbarra no lockout progressivo; o código é de uso único e some depois de 5 erros ou 10 minutos.
  async verifyCode(challengeId: string, code: string): Promise<PlatformSession> {
    const admin = readPlatformAdmin(this.config);
    if (!admin || !this.twoFactorEnabled() || await this.state.isLocked(admin!.email)) {
      throw new UnauthorizedException(TWO_FACTOR_INVALID_MESSAGE);
    }

    const result = await this.state.checkCode(this.codeScope(admin!), challengeId, code);
    if (result === "invalid" || result === "locked") await this.state.registerFailure(admin!.email);
    if (result !== "ok") throw new UnauthorizedException(TWO_FACTOR_INVALID_MESSAGE);

    await this.state.clear("platform-lockout", admin!.email);
    return this.issueSession(admin);
  }

  private async startChallenge(admin: PlatformAdminCredentials): Promise<PlatformChallenge> {
    const challengeId = randomBytes(24).toString("hex");
    const code = await this.state.issueCode(this.codeScope(admin!), challengeId, CODE_TTL_MS);

    const frontend = (this.config.get<string>("FRONTEND_URL") ?? "").replace(/\/+$/, "");
    const message = buildVerificationCodeEmail({
      title: "Código de acesso à plataforma",
      intro: "Alguém informou a senha da conta da plataforma do Marquo. Use o código abaixo para concluir o acesso.",
      code: code!,
      expiresInMinutes: CODE_TTL_MS / 60_000,
      logoUrl: frontend ? `${frontend}/brand/email/marquo-logo.png` : undefined,
      siteUrl: frontend || undefined,
    });
    const sent = await this.email.send({ to: [admin.email], ...message });
    if (!sent) {
      // Sem o código na caixa o admin não consegue concluir: descarta o desafio e avisa (a senha estava certa).
      await this.state.clear(this.codeScope(admin!), challengeId);
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

}

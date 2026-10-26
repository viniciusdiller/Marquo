import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { buildEmailVerificationEmail } from "../email/email-verification.email";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";

const TOKEN_BYTES = 32;
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
// Pedidos repetidos de reenvio dentro deste intervalo não geram novo e-mail.
export const VERIFICATION_COOLDOWN_MS = 2 * 60 * 1000;

export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";
export const INVALID_VERIFICATION_MESSAGE =
  "Este link de confirmação é inválido ou expirou. Peça um novo na tela de entrada.";

// Token novo: o claro segue no e-mail; só o hash vai para o banco (mesmo modelo do link de definir senha).
export function newVerificationToken(now: Date = new Date()) {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  return { token, hash: hashPasswordSetToken(token), expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS) };
}

export type VerificationMode = "verify" | "skip" | "unavailable";

// Confirmação de e-mail de quem criou conta de negócio pelo cadastro público. A conta nasce sem confirmação e não entra
// (ver AuthService.login) até o dono do e-mail abrir o link. Evita ocupar o e-mail de outra pessoa.
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // verify = e-mail configurado, exige confirmar. skip = sem e-mail E fora de produção (desenvolvimento): a conta nasce
  // confirmada, senão ninguém entraria. unavailable = sem e-mail em PRODUÇÃO: criar conta que ninguém consegue confirmar
  // só gera conta presa, então o cadastro recusa (fail closed).
  mode(): VerificationMode {
    if (this.email.isConfigured()) return "verify";
    return this.config.get<string>("NODE_ENV") === "production" ? "unavailable" : "skip";
  }

  async sendVerificationEmail(user: { name: string; email: string }, token: string): Promise<boolean> {
    const frontend = (this.config.get<string>("FRONTEND_URL") ?? "").replace(/\/+$/, "");
    if (!frontend) return false;
    const message = buildEmailVerificationEmail({
      name: user.name,
      link: `${frontend}/verificar-email?token=${token}`,
      expiresInHours: VERIFICATION_TTL_MS / 3_600_000,
      logoUrl: `${frontend}/brand/email/marquo-logo.png`,
      siteUrl: frontend,
    });
    return this.email.send({ to: [user.email], ...message });
  }

  // Consome o link: UM UPDATE condicional (hash + validade + conta ativa), então dois cliques concorrentes não
  // confirmam duas vezes e um token vencido nunca passa.
  async verify(token: string, now: Date = new Date()): Promise<void> {
    const confirmed = await this.prisma.user.updateMany({
      where: {
        emailVerificationTokenHash: hashPasswordSetToken(token),
        emailVerificationExpiresAt: { gt: now },
        isActive: true,
      },
      data: { emailVerifiedAt: now, emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
    });
    if (confirmed.count === 0) throw new BadRequestException(INVALID_VERIFICATION_MESSAGE);
  }

  // Reenvio pedido pela tela de entrada. Resposta HTTP sempre igual (não revela se a conta existe nem se já confirmou);
  // o trabalho roda depois de responder e nunca lança.
  request(rawEmail: string): void {
    void this.process(rawEmail).catch((error: unknown) => {
      this.logger.warn(`Falha ao reenviar confirmação de e-mail: ${(error as Error).name}`);
    });
  }

  async process(email: string, now: Date = new Date()): Promise<void> {
    if (!this.email.isConfigured()) return;

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, isActive: true, emailVerifiedAt: true, emailVerificationExpiresAt: true },
    });
    if (!user || !user.isActive || user.emailVerifiedAt) return;

    const expiresAt = user.emailVerificationExpiresAt?.getTime();
    if (
      expiresAt &&
      expiresAt > now.getTime() + VERIFICATION_TTL_MS - VERIFICATION_COOLDOWN_MS &&
      expiresAt <= now.getTime() + VERIFICATION_TTL_MS
    ) {
      return;
    }

    const next = newVerificationToken(now);
    const updated = await this.prisma.user.updateMany({
      where: { id: user.id, isActive: true, emailVerifiedAt: null },
      data: { emailVerificationTokenHash: next.hash, emailVerificationExpiresAt: next.expiresAt },
    });
    if (updated.count === 0) return;

    await this.sendVerificationEmail(user, next.token);
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { buildPasswordResetEmail } from "../email/password-reset.email";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";

const TOKEN_BYTES = 32;
// Mais curto que o link gerado pelo suporte (24 h): este vai para a caixa de e-mail, que é o elo mais fraco.
export const RESET_TTL_MS = 60 * 60 * 1000;
// Pedidos repetidos dentro deste intervalo não geram novo e-mail (evita usar o Marquo para encher a caixa de alguém).
export const RESET_COOLDOWN_MS = 2 * 60 * 1000;

// Recuperação de senha de staff (dono, recepção, profissional) por e-mail. Reaproveita o MESMO token de "definir
// senha" (hash no banco, validade, uso único, resgatado em /auth/set-password), então trocar a senha já derruba as
// sessões antigas e zera o bloqueio por tentativas.
//
// A resposta do endpoint é SEMPRE a mesma, exista a conta ou não, e todo o trabalho (banco + e-mail) roda depois de
// responder: o tempo de resposta não pode denunciar se o e-mail está cadastrado.
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // Ponto de entrada do controller: não espera e nunca lança.
  request(rawEmail: string): void {
    void this.process(rawEmail).catch((error: unknown) => {
      this.logger.warn(`Falha ao processar recuperação de senha: ${(error as Error).name}`);
    });
  }

  async process(email: string, now: Date = new Date()): Promise<void> {
    // Sem e-mail configurado não há como entregar o link: não gera token à toa (o suporte segue gerando o link manual).
    if (!this.email.isConfigured()) return;

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, isActive: true, passwordSetTokenExpiresAt: true },
    });
    // Conta inexistente ou desativada: silêncio (mesma resposta HTTP).
    if (!user || !user.isActive) return;

    // Cooldown: um token emitido por este fluxo há menos de RESET_COOLDOWN_MS expira em (agora + TTL - cooldown, agora + TTL].
    const expiresAt = user.passwordSetTokenExpiresAt?.getTime();
    if (expiresAt && expiresAt > now.getTime() + RESET_TTL_MS - RESET_COOLDOWN_MS && expiresAt <= now.getTime() + RESET_TTL_MS) {
      return;
    }

    const token = randomBytes(TOKEN_BYTES).toString("hex");
    const updated = await this.prisma.user.updateMany({
      // isActive no WHERE: a conta pode ter sido desativada entre a leitura e a escrita.
      where: { id: user.id, isActive: true },
      data: {
        passwordSetTokenHash: hashPasswordSetToken(token),
        passwordSetTokenExpiresAt: new Date(now.getTime() + RESET_TTL_MS),
      },
    });
    if (updated.count === 0) return;

    const frontend = (this.config.get<string>("FRONTEND_URL") ?? "").replace(/\/+$/, "");
    if (!frontend) return;

    const message = buildPasswordResetEmail({
      name: user.name,
      link: `${frontend}/definir-senha?token=${token}`,
      expiresInMinutes: RESET_TTL_MS / 60_000,
      logoUrl: `${frontend}/brand/email/marquo-logo.png`,
      siteUrl: frontend,
    });
    await this.email.send({ to: [user.email], ...message });
  }
}

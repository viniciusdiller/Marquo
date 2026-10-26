import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { buildVerificationCodeEmail } from "../email/verification-code.email";
import { CodeCheck, OneTimeCodeStore, oneTimeCodeSecret } from "../common/utils/one-time-code";

const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
// Teto de códigos vivos: o mapa não cresce sem limite sob abuso (os mais antigos saem primeiro).
const CODE_MAX_ENTRIES = 5_000;
// Intervalo mínimo entre dois códigos para o MESMO e-mail (além do limite por IP da rota).
export const REGISTER_CODE_COOLDOWN_MS = 60_000;

// required = e-mail configurado: o cadastro exige o código. skip = sem e-mail E fora de produção (desenvolvimento): não
// exige, senão ninguém se cadastraria. unavailable = sem e-mail em PRODUÇÃO: sem como entregar o código, recusa (fail closed).
export type RegisterCodeMode = "required" | "skip" | "unavailable";

// Código de 6 dígitos enviado ao e-mail digitado no cadastro de cliente. Prova que a pessoa controla aquele e-mail
// (Consumer.email é usado para entrar), e só isso: NÃO prova a posse do telefone, que é a chave de identidade. O código
// fica só em memória, como HMAC, com validade, limite de tentativas e uso único.
@Injectable()
export class ConsumerEmailCodeService {
  private readonly logger = new Logger(ConsumerEmailCodeService.name);
  private store: OneTimeCodeStore | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private get codes(): OneTimeCodeStore {
    this.store ??= new OneTimeCodeStore(oneTimeCodeSecret(this.config.getOrThrow<string>("JWT_SECRET")), {
      ttlMs: CODE_TTL_MS,
      maxAttempts: CODE_MAX_ATTEMPTS,
      maxEntries: CODE_MAX_ENTRIES,
    });
    return this.store;
  }

  mode(): RegisterCodeMode {
    if (this.email.isConfigured()) return "required";
    return this.config.get<string>("NODE_ENV") === "production" ? "unavailable" : "skip";
  }

  // Pedido de código pela tela de cadastro. A resposta HTTP não depende de nada disto (envio depois de responder, nunca lança).
  request(rawEmail: string): void {
    void this.process(rawEmail).catch((error: unknown) => {
      this.logger.warn(`Falha ao enviar código de cadastro: ${(error as Error).name}`);
    });
  }

  async process(rawEmail: string): Promise<void> {
    if (this.mode() !== "required") return;
    const email = rawEmail.trim().toLowerCase();
    if (this.codes.waitMs(email, REGISTER_CODE_COOLDOWN_MS) > 0) return;

    // E-mail que já tem conta com senha: o cadastro responderia 409 de qualquer jeito, então não manda código (não
    // enche a caixa de quem já é cliente).
    const existing = await this.prisma.consumer.findUnique({ where: { email }, select: { passwordHash: true } });
    if (existing?.passwordHash) return;

    const code = this.codes.issue(email);
    const frontend = (this.config.get<string>("FRONTEND_URL") ?? "").replace(/\/+$/, "");
    const message = buildVerificationCodeEmail({
      title: "Confirme seu e-mail",
      intro: "Use o código abaixo para terminar de criar sua conta no Marquo.",
      code,
      expiresInMinutes: CODE_TTL_MS / 60_000,
      logoUrl: frontend ? `${frontend}/brand/email/marquo-logo.png` : undefined,
      siteUrl: frontend || undefined,
    });
    await this.email.send({ to: [email], ...message });
  }

  check(rawEmail: string, code: string): CodeCheck {
    return this.codes.check(rawEmail.trim().toLowerCase(), code);
  }

  consume(rawEmail: string): void {
    this.codes.consume(rawEmail.trim().toLowerCase());
  }
}

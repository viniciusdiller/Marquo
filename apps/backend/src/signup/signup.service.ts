import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma, Role } from "@marquo/database";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { generateUniqueSlug } from "../common/utils/slug.util";
import { normalizePhone } from "../common/utils/phone.util";
import { CouponsService } from "../coupons/coupons.service";
import { isReservedSlug } from "../common/constants/reserved-slugs";
import { TRIAL_DAYS } from "../billing/trial.constants";
import { SignupDto } from "./dto/signup.dto";
import { EmailVerificationService, newVerificationToken } from "../auth/email-verification.service";

const BCRYPT_ROUNDS = 12;
const MAX_SLUG_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Trade-off consciente de UX vs. segurança (registrado no CLAUDE.md): sem provedor de e-mail
// na v1 não dá para responder de forma genérica e confirmar por e-mail, então o cadastro revela
// que o e-mail já tem conta (409) — mesmo compromisso já aceito no cadastro de Consumer. O
// login continua respondendo sempre o mesmo 401.
export const EMAIL_TAKEN_MESSAGE =
  "Este e-mail já está cadastrado. Entre na sua conta ou use outro e-mail.";

export const TERMS_OUTDATED_MESSAGE =
  "Os Termos de Uso e a Política de Privacidade foram atualizados. Recarregue a página e aceite novamente.";

function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === "string" && target.includes(field);
}

@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
    private readonly verification: EmailVerificationService,
  ) {}

  // Cria Tenant + OWNER em trial, tudo numa transação. Nasce SEM Subscription: o status de
  // billing vem de computeBillingStatus (TRIALING até trialEndsAt, depois TRIAL_EXPIRED).
  async signup(dto: SignupDto): Promise<{ slug: string; emailVerificationRequired: boolean }> {
    // Antes de qualquer custo (bcrypt, banco): sem o aceite da versão vigente não há conta.
    if (dto.acceptedTermsVersion !== LEGAL_DOCS_VERSION) {
      throw new BadRequestException(TERMS_OUTDATED_MESSAGE);
    }

    // Confirmação de e-mail: sem como enviar o link em produção, recusa ANTES de criar qualquer coisa (conta que ninguém
    // consegue confirmar só ficaria presa). Em desenvolvimento sem e-mail a conta nasce confirmada.
    const mode = this.verification.mode();
    if (mode === "unavailable") {
      throw new ServiceUnavailableException("Não foi possível concluir o cadastro agora. Tente novamente mais tarde.");
    }
    const verification = mode === "verify" ? newVerificationToken() : null;

    // O hash roda ANTES de qualquer consulta, então o custo de CPU é o mesmo com e-mail novo ou
    // repetido (não há atalho barato que diferencie os caminhos pelo tempo).
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const baseTrialDays = TRIAL_DAYS;
    const couponCode = dto.couponCode?.trim() ? dto.couponCode : null;

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          // Cupom ANTES de criar o negócio, na mesma transação: cupom inválido derruba o cadastro inteiro e o uso
          // reservado volta junto se qualquer passo seguinte falhar.
          const coupon = couponCode ? await this.coupons.reserve(tx, couponCode) : null;
          const extraTrialDays = coupon?.kind === "TRIAL_DAYS" ? coupon.value : 0;
          const trialEndsAt = new Date(Date.now() + (baseTrialDays + extraTrialDays) * DAY_MS);

          const slug = await generateUniqueSlug(dto.businessName, async (candidate) => {
            if (isReservedSlug(candidate)) return true;
            const existing = await tx.tenant.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return existing !== null;
          });

          const tenant = await tx.tenant.create({
            data: { name: dto.businessName, slug, trialEndsAt },
          });

          // Papel e tenant são fixados aqui; nada disso vem do body.
          await tx.user.create({
            data: {
              tenantId: tenant.id,
              email: dto.email,
              passwordHash,
              name: dto.ownerName,
              phone: normalizePhone(dto.phone),
              role: Role.OWNER,
              // Data e versão vêm do servidor (a versão é a vigente, já conferida acima).
              termsAcceptedAt: new Date(),
              termsVersion: LEGAL_DOCS_VERSION,
              // Sem confirmação até o dono do e-mail abrir o link (ver AuthService.login).
              emailVerifiedAt: verification ? null : new Date(),
              emailVerificationTokenHash: verification?.hash ?? null,
              emailVerificationExpiresAt: verification?.expiresAt ?? null,
            },
          });

          if (coupon) await this.coupons.recordRedemption(tx, coupon.couponId, tenant.id);

          return { slug };
        });

        // Só depois do commit; falha de e-mail não desfaz o cadastro (o link pode ser reenviado pela tela de entrada).
        if (verification) {
          void this.verification
            .sendVerificationEmail({ name: dto.ownerName, email: dto.email }, verification.token)
            .catch(() => undefined);
        }
        return { ...result, emailVerificationRequired: verification !== null };
      } catch (error) {
        // A unicidade de e-mail é decidida pelo banco (sem "checar antes, inserir depois"),
        // então dois cadastros simultâneos com o mesmo e-mail não passam os dois.
        if (isUniqueViolation(error, "email")) {
          throw new ConflictException(EMAIL_TAKEN_MESSAGE);
        }
        // Corrida rara: outro cadastro pegou o mesmo slug entre a checagem e o INSERT.
        if (isUniqueViolation(error, "slug") && attempt < MAX_SLUG_ATTEMPTS) continue;
        throw error;
      }
    }
  }
}

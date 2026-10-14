import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Prisma, Role } from "@marquo/database";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { generateUniqueSlug } from "../common/utils/slug.util";
import { isReservedSlug } from "../common/constants/reserved-slugs";
import { TRIAL_DAYS } from "../billing/trial.constants";
import { SignupDto } from "./dto/signup.dto";

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
  constructor(private readonly prisma: PrismaService) {}

  // Cria Tenant + OWNER em trial, tudo numa transação. Nasce SEM Subscription: o status de
  // billing vem de computeBillingStatus (TRIALING até trialEndsAt, depois TRIAL_EXPIRED).
  async signup(dto: SignupDto): Promise<{ slug: string }> {
    // Antes de qualquer custo (bcrypt, banco): sem o aceite da versão vigente não há conta.
    if (dto.acceptedTermsVersion !== LEGAL_DOCS_VERSION) {
      throw new BadRequestException(TERMS_OUTDATED_MESSAGE);
    }

    // O hash roda ANTES de qualquer consulta, então o custo de CPU é o mesmo com e-mail novo ou
    // repetido (não há atalho barato que diferencie os caminhos pelo tempo).
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * DAY_MS);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
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
              role: Role.OWNER,
              // Data e versão vêm do servidor (a versão é a vigente, já conferida acima).
              termsAcceptedAt: new Date(),
              termsVersion: LEGAL_DOCS_VERSION,
            },
          });

          return { slug };
        });
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

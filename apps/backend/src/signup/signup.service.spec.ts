import "reflect-metadata";
import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import * as bcrypt from "bcrypt";
import { Prisma, Role } from "@marquo/database";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { TRIAL_DAYS } from "../billing/trial.constants";
import { computeBillingStatus, hasBillingAccess } from "../billing/billing-status.util";
import { CouponsService } from "../coupons/coupons.service";
import { SignupDto } from "./dto/signup.dto";
import { EMAIL_TAKEN_MESSAGE, SignupService, TERMS_OUTDATED_MESSAGE } from "./signup.service";
import { EmailVerificationService, VerificationMode } from "../auth/email-verification.service";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";

// bcrypt real (o teste de senha compara o hash de verdade); só embrulha `hash` num jest.fn para
// poder checar a ORDEM das chamadas.
jest.mock("bcrypt", () => {
  const actual = jest.requireActual("bcrypt");
  return { ...actual, hash: jest.fn(actual.hash) };
});

const DAY_MS = 24 * 60 * 60 * 1000;

const DTO: SignupDto = {
  businessName: "Barbearia do Zé",
  ownerName: "José Silva",
  email: "ze@barbearia.com",
  phone: "(11) 91234-5678",
  password: "senha-forte-123",
  acceptedTermsVersion: LEGAL_DOCS_VERSION,
};

function uniqueViolation(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

// Simula o `$transaction(cb)` do Prisma: executa o callback com um `tx` fake. Um erro dentro do
// callback propaga como no cliente real (a transação seria revertida).
function buildPrisma(overrides: { tenantSlugsTaken?: string[]; userCreate?: jest.Mock } = {}) {
  const taken = new Set(overrides.tenantSlugsTaken ?? []);
  const tx = {
    coupon: { findUnique: jest.fn().mockResolvedValue(null) },
    couponRedemption: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenant: {
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(taken.has(where.slug) ? { id: "existing" } : null),
      ),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "t-1", ...data })),
    },
    user: {
      create: overrides.userCreate ?? jest.fn().mockResolvedValue({ id: "u-1" }),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  return { prisma, tx };
}

// Padrão "skip" (e-mail desligado, desenvolvimento): a conta nasce confirmada e os testes antigos seguem valendo.
function verifier(mode: VerificationMode = "skip") {
  const sendVerificationEmail = jest.fn().mockResolvedValue(true);
  const service = { mode: () => mode, sendVerificationEmail } as unknown as EmailVerificationService;
  return Object.assign(service, { sendVerificationEmail });
}

describe("SignupService", () => {
  it("cria Tenant em trial de 14 dias e OWNER, sem Subscription", async () => {
    const { prisma, tx } = buildPrisma();
    const before = Date.now();

    const result = await new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);

    expect(result).toEqual({ slug: "barbearia-do-ze", emailVerificationRequired: false });
    const tenantData = tx.tenant.create.mock.calls[0][0].data;
    expect(tenantData.name).toBe("Barbearia do Zé");
    expect(tenantData.slug).toBe("barbearia-do-ze");
    const trialMs = tenantData.trialEndsAt.getTime() - before;
    expect(trialMs).toBeGreaterThanOrEqual(TRIAL_DAYS * DAY_MS - 1000);
    expect(trialMs).toBeLessThanOrEqual(TRIAL_DAYS * DAY_MS + 5000);
    // Nenhum vínculo de billing é criado no cadastro: o status vem do trial.
    expect(tenantData).not.toHaveProperty("subscription");
  });

  it("papel OWNER e tenantId são definidos pelo servidor, e a senha é guardada em bcrypt", async () => {
    const { prisma, tx } = buildPrisma();

    await new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.role).toBe(Role.OWNER);
    expect(userData.tenantId).toBe("t-1");
    expect(userData.email).toBe("ze@barbearia.com");
    // Telefone do dono vai normalizado (só dígitos, sem DDI) para o contato comercial da plataforma.
    expect(userData.phone).toBe("11912345678");
    expect(userData.passwordHash).not.toBe(DTO.password);
    await expect(bcrypt.compare(DTO.password, userData.passwordHash)).resolves.toBe(true);
    // A confirmação de e-mail agora é decidida SEMPRE pelo servidor (nunca pelo body): este teste usa o modo "skip"
    // (e-mail desligado, desenvolvimento), em que a conta nasce confirmada. O modo "verify" está coberto abaixo.
    expect(userData.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("um tenant recém-criado tem acesso (TRIALING) e, vencido o trial, é bloqueado", async () => {
    const { prisma, tx } = buildPrisma();
    await new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);
    const { trialEndsAt } = tx.tenant.create.mock.calls[0][0].data;

    const active = computeBillingStatus({ trialEndsAt }, null);
    expect(active).toBe("TRIALING");
    expect(hasBillingAccess(active)).toBe(true);

    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(trialEndsAt.getTime() + 1000);
    try {
      const expired = computeBillingStatus({ trialEndsAt }, null);
      expect(expired).toBe("TRIAL_EXPIRED");
      expect(hasBillingAccess(expired)).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  // Regressão do risco novo do cadastro público: /[slug] divide o namespace com as rotas do app.
  it.each(["Dashboard", "Entrar", "Cadastro", "Marquo", "API"])(
    "nome '%s' não ocupa slug reservado",
    async (name) => {
      const { prisma, tx } = buildPrisma();

      const { slug } = await new SignupService(prisma, new CouponsService(), verifier()).signup({ ...DTO, businessName: name });

      expect(slug).toMatch(/-2$/);
      expect(tx.tenant.create.mock.calls[0][0].data.slug).toBe(slug);
    },
  );

  it("slug já usado por outro tenant recebe sufixo", async () => {
    const { prisma } = buildPrisma({ tenantSlugsTaken: ["barbearia-do-ze", "barbearia-do-ze-2"] });

    const { slug } = await new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);

    expect(slug).toBe("barbearia-do-ze-3");
  });

  it("e-mail já cadastrado (violação única decidida pelo banco) vira 409", async () => {
    const { prisma } = buildPrisma({
      userCreate: jest.fn().mockRejectedValue(uniqueViolation(["email"])),
    });

    const attempt = new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({ message: EMAIL_TAKEN_MESSAGE });
  });

  it("corrida no slug: tenta de novo e conclui; e desiste após 3 tentativas", async () => {
    const userCreate = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation(["slug"]))
      .mockResolvedValue({ id: "u-1" });
    const { prisma } = buildPrisma({ userCreate });

    await expect(new SignupService(prisma, new CouponsService(), verifier()).signup(DTO)).resolves.toEqual({ slug: "barbearia-do-ze", emailVerificationRequired: false });
    expect(userCreate).toHaveBeenCalledTimes(2);

    const alwaysSlug = buildPrisma({
      userCreate: jest.fn().mockRejectedValue(uniqueViolation(["slug"])),
    });
    await expect(new SignupService(alwaysSlug.prisma, new CouponsService(), verifier()).signup(DTO)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it("erro inesperado não é convertido em 409 (não esconde falha real)", async () => {
    const boom = new Error("conexão perdida");
    const { prisma } = buildPrisma({ userCreate: jest.fn().mockRejectedValue(boom) });

    await expect(new SignupService(prisma, new CouponsService(), verifier()).signup(DTO)).rejects.toBe(boom);
  });

  it("hasheia a senha antes de tocar no banco (mesmo custo com e-mail novo ou repetido)", async () => {
    const hashMock = bcrypt.hash as unknown as jest.Mock;
    hashMock.mockClear();
    const { prisma } = buildPrisma({
      userCreate: jest.fn().mockRejectedValue(uniqueViolation(["email"])),
    });

    // Mesmo no caminho de e-mail repetido (409) o bcrypt já rodou antes da transação.
    await expect(new SignupService(prisma, new CouponsService(), verifier()).signup(DTO)).rejects.toBeInstanceOf(ConflictException);

    const hashOrder = hashMock.mock.invocationCallOrder[0];
    const dbOrder = (prisma.$transaction as jest.Mock).mock.invocationCallOrder[0];
    expect(hashMock).toHaveBeenCalledTimes(1);
    expect(hashOrder).toBeLessThan(dbOrder);
  });
});

describe("SignupService: aceite dos termos", () => {
  it("grava a data e a versão vigente dos termos no dono", async () => {
    const { prisma, tx } = buildPrisma();
    const before = Date.now();

    await new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.termsVersion).toBe(LEGAL_DOCS_VERSION);
    expect(userData.termsAcceptedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(userData.termsAcceptedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  // O servidor decide a versão vigente: um cliente com a página velha aberta, ou que tenta enviar
  // qualquer coisa, não cria conta sem aceitar o texto atual.
  it.each(["2020-01-01", "", "true", LEGAL_DOCS_VERSION + " ", "x".repeat(40)])(
    "recusa versão de termos %j sem gastar bcrypt nem tocar no banco",
    async (version) => {
      const hashMock = bcrypt.hash as unknown as jest.Mock;
      hashMock.mockClear();
      const { prisma } = buildPrisma();

      const attempt = new SignupService(prisma, new CouponsService(), verifier()).signup({ ...DTO, acceptedTermsVersion: version });

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toMatchObject({ message: TERMS_OUTDATED_MESSAGE });
      expect(hashMock).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe("SignupDto (fronteira pública)", () => {
  const valid = {
    businessName: "Salão",
    ownerName: "Maria",
    email: "M@X.com",
    phone: "11912345678",
    password: "12345678",
    acceptedTermsVersion: LEGAL_DOCS_VERSION,
  };

  it("normaliza e-mail e apara nomes", async () => {
    const dto = plainToInstance(SignupDto, { ...valid, businessName: "  Salão  ", email: " M@X.com " });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto.email).toBe("m@x.com");
    expect(dto.businessName).toBe("Salão");
  });

  it.each([
    ["senha curta", { password: "1234567" }],
    ["senha acima de 72 (limite do bcrypt)", { password: "a".repeat(73) }],
    ["e-mail inválido", { email: "nao-e-email" }],
    ["nome de negócio vazio", { businessName: "   " }],
    ["nome do dono muito longo", { ownerName: "a".repeat(121) }],
    ["versão de termos vazia", { acceptedTermsVersion: "" }],
    ["versão de termos ausente", { acceptedTermsVersion: undefined }],
    ["versão de termos que não é texto", { acceptedTermsVersion: true }],
    ["versão de termos gigante", { acceptedTermsVersion: "v".repeat(41) }],
    ["telefone ausente", { phone: undefined }],
    ["telefone inválido (DDD inexistente)", { phone: "0011912345678" }],
    ["telefone só com zeros", { phone: "00000000000" }],
    ["telefone com texto", { phone: "abc" }],
  ])("rejeita %s", async (_label, patch) => {
    const dto = plainToInstance(SignupDto, { ...valid, ...patch });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  // Confiança no cliente: papel, tenant, plano, trial e verificação nunca vêm do body.
  it.each(["role", "tenantId", "planTier", "trialEndsAt", "emailVerifiedAt", "priceCents", "termsAcceptedAt", "termsVersion"])(
    "rejeita campo '%s' enviado pelo cliente",
    async (field) => {
      const dto = plainToInstance(SignupDto, { ...valid, [field]: "OWNER" });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );
});

describe("SignupService: cupom", () => {
  const COUPON = {
    id: "c-1",
    kind: "TRIAL_DAYS",
    value: 30,
    isActive: true,
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    redemptionCount: 0,
  };

  function withCoupon(coupon: Record<string, unknown> | null, reserved = 1) {
    const built = buildPrisma();
    built.tx.coupon.findUnique.mockResolvedValue(coupon);
    built.tx.$executeRaw.mockResolvedValue(reserved);
    return built;
  }

  it("cupom de dias soma ao trial e registra o resgate no mesmo cadastro", async () => {
    const { prisma, tx } = withCoupon(COUPON);
    const before = Date.now();

    await new SignupService(prisma, new CouponsService(), verifier()).signup({ ...DTO, couponCode: " promo30 " });

    expect(tx.coupon.findUnique.mock.calls[0][0].where).toEqual({ code: "PROMO30" });
    const trialMs = tx.tenant.create.mock.calls[0][0].data.trialEndsAt.getTime() - before;
    expect(trialMs).toBeGreaterThanOrEqual((TRIAL_DAYS + 30) * DAY_MS - 1000);
    expect(trialMs).toBeLessThanOrEqual((TRIAL_DAYS + 30) * DAY_MS + 5000);
    expect(tx.couponRedemption.create).toHaveBeenCalledWith({ data: { couponId: "c-1", tenantId: "t-1" } });
  });

  it("sem cupom: trial padrão e nada de resgate", async () => {
    const { prisma, tx } = withCoupon(COUPON);
    await new SignupService(prisma, new CouponsService(), verifier()).signup(DTO);
    expect(tx.coupon.findUnique).not.toHaveBeenCalled();
    expect(tx.couponRedemption.create).not.toHaveBeenCalled();
  });

  // Cupom percentual/fixo não altera o trial: fica registrado para a primeira cobrança.
  it("cupom de desconto não mexe no trial, mas registra o resgate", async () => {
    const { prisma, tx } = withCoupon({ ...COUPON, kind: "PERCENT", value: 20 });
    const before = Date.now();
    await new SignupService(prisma, new CouponsService(), verifier()).signup({ ...DTO, couponCode: "DESC20" });
    const trialMs = tx.tenant.create.mock.calls[0][0].data.trialEndsAt.getTime() - before;
    expect(trialMs).toBeLessThanOrEqual(TRIAL_DAYS * DAY_MS + 5000);
    expect(tx.couponRedemption.create).toHaveBeenCalled();
  });

  // Toda recusa é a MESMA mensagem: não dá para sondar quais códigos existem, expiraram ou esgotaram.
  it.each([
    ["inexistente", null, 1],
    ["desativado", { ...COUPON, isActive: false }, 1],
    ["expirado", { ...COUPON, validUntil: new Date(Date.now() - 1000) }, 1],
    ["esgotado", { ...COUPON, maxRedemptions: 5, redemptionCount: 5 }, 1],
    ["perdeu a corrida pelo último uso", COUPON, 0],
  ])("cupom %s: 400 com mensagem genérica e nada é criado", async (_label, coupon, reserved) => {
    const { prisma, tx } = withCoupon(coupon as Record<string, unknown> | null, reserved as number);

    await expect(
      new SignupService(prisma, new CouponsService(), verifier()).signup({ ...DTO, couponCode: "PROMO30" }),
    ).rejects.toThrow("Cupom inválido ou expirado.");

    expect(tx.tenant.create).not.toHaveBeenCalled();
    expect(tx.couponRedemption.create).not.toHaveBeenCalled();
  });

  it("código com formato inválido é recusado sem nem consultar o banco", async () => {
    const { prisma, tx } = withCoupon(COUPON);
    await expect(
      new SignupService(prisma, new CouponsService(), verifier()).signup({ ...DTO, couponCode: "x'; DROP--" }),
    ).rejects.toThrow("Cupom inválido ou expirado.");
    expect(tx.coupon.findUnique).not.toHaveBeenCalled();
  });
});

describe("SignupService: confirmação de e-mail do dono", () => {
  it("com e-mail configurado: a conta nasce SEM confirmação, só o hash do token vai ao banco e o link sai por e-mail", async () => {
    const { prisma, tx } = buildPrisma();
    const v = verifier("verify");

    const result = await new SignupService(prisma, new CouponsService(), v).signup(DTO);

    const data = tx.user.create.mock.calls[0][0].data;
    expect(data.emailVerifiedAt).toBeNull();
    expect(data.emailVerificationExpiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    const [user, token] = v.sendVerificationEmail.mock.calls[0];
    expect(user).toEqual({ name: "José Silva", email: "ze@barbearia.com" });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(data.emailVerificationTokenHash).toBe(hashPasswordSetToken(token));
    expect(data.emailVerificationTokenHash).not.toBe(token);
    expect(result.emailVerificationRequired).toBe(true);
  });

  it("sem e-mail em desenvolvimento: a conta nasce confirmada (senão ninguém entraria) e não envia nada", async () => {
    const { prisma, tx } = buildPrisma();
    const v = verifier("skip");
    const result = await new SignupService(prisma, new CouponsService(), v).signup(DTO);

    expect(tx.user.create.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(tx.user.create.mock.calls[0][0].data.emailVerificationTokenHash).toBeNull();
    expect(v.sendVerificationEmail).not.toHaveBeenCalled();
    expect(result.emailVerificationRequired).toBe(false);
  });

  it("sem e-mail em PRODUÇÃO: recusa o cadastro (503) antes de criar qualquer coisa", async () => {
    const { prisma, tx } = buildPrisma();
    await expect(new SignupService(prisma, new CouponsService(), verifier("unavailable")).signup(DTO)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("falha ao enviar o e-mail não desfaz o cadastro", async () => {
    const { prisma } = buildPrisma();
    const v = verifier("verify");
    v.sendVerificationEmail.mockRejectedValue(new Error("provedor fora"));
    await expect(new SignupService(prisma, new CouponsService(), v).signup(DTO)).resolves.toMatchObject({ slug: "barbearia-do-ze" });
  });

  it("e-mail já cadastrado (409): nenhum e-mail de confirmação sai", async () => {
    const { prisma } = buildPrisma({ userCreate: jest.fn().mockRejectedValue(uniqueViolation(["email"])) });
    const v = verifier("verify");
    await expect(new SignupService(prisma, new CouponsService(), v).signup(DTO)).rejects.toThrow(ConflictException);
    expect(v.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

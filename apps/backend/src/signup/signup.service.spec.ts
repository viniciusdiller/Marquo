import "reflect-metadata";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import * as bcrypt from "bcrypt";
import { Prisma, Role } from "@marquo/database";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { TRIAL_DAYS } from "../billing/trial.constants";
import { computeBillingStatus, hasBillingAccess } from "../billing/billing-status.util";
import { SignupDto } from "./dto/signup.dto";
import { EMAIL_TAKEN_MESSAGE, SignupService, TERMS_OUTDATED_MESSAGE } from "./signup.service";

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

describe("SignupService", () => {
  it("cria Tenant em trial de 14 dias e OWNER, sem Subscription", async () => {
    const { prisma, tx } = buildPrisma();
    const before = Date.now();

    const result = await new SignupService(prisma).signup(DTO);

    expect(result).toEqual({ slug: "barbearia-do-ze" });
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

    await new SignupService(prisma).signup(DTO);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.role).toBe(Role.OWNER);
    expect(userData.tenantId).toBe("t-1");
    expect(userData.email).toBe("ze@barbearia.com");
    expect(userData.passwordHash).not.toBe(DTO.password);
    await expect(bcrypt.compare(DTO.password, userData.passwordHash)).resolves.toBe(true);
    // emailVerifiedAt fica nulo: nada exige verificação na v1.
    expect(userData).not.toHaveProperty("emailVerifiedAt");
  });

  it("um tenant recém-criado tem acesso (TRIALING) e, vencido o trial, é bloqueado", async () => {
    const { prisma, tx } = buildPrisma();
    await new SignupService(prisma).signup(DTO);
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

      const { slug } = await new SignupService(prisma).signup({ ...DTO, businessName: name });

      expect(slug).toMatch(/-2$/);
      expect(tx.tenant.create.mock.calls[0][0].data.slug).toBe(slug);
    },
  );

  it("slug já usado por outro tenant recebe sufixo", async () => {
    const { prisma } = buildPrisma({ tenantSlugsTaken: ["barbearia-do-ze", "barbearia-do-ze-2"] });

    const { slug } = await new SignupService(prisma).signup(DTO);

    expect(slug).toBe("barbearia-do-ze-3");
  });

  it("e-mail já cadastrado (violação única decidida pelo banco) vira 409", async () => {
    const { prisma } = buildPrisma({
      userCreate: jest.fn().mockRejectedValue(uniqueViolation(["email"])),
    });

    const attempt = new SignupService(prisma).signup(DTO);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({ message: EMAIL_TAKEN_MESSAGE });
  });

  it("corrida no slug: tenta de novo e conclui; e desiste após 3 tentativas", async () => {
    const userCreate = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation(["slug"]))
      .mockResolvedValue({ id: "u-1" });
    const { prisma } = buildPrisma({ userCreate });

    await expect(new SignupService(prisma).signup(DTO)).resolves.toEqual({ slug: "barbearia-do-ze" });
    expect(userCreate).toHaveBeenCalledTimes(2);

    const alwaysSlug = buildPrisma({
      userCreate: jest.fn().mockRejectedValue(uniqueViolation(["slug"])),
    });
    await expect(new SignupService(alwaysSlug.prisma).signup(DTO)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it("erro inesperado não é convertido em 409 (não esconde falha real)", async () => {
    const boom = new Error("conexão perdida");
    const { prisma } = buildPrisma({ userCreate: jest.fn().mockRejectedValue(boom) });

    await expect(new SignupService(prisma).signup(DTO)).rejects.toBe(boom);
  });

  it("hasheia a senha antes de tocar no banco (mesmo custo com e-mail novo ou repetido)", async () => {
    const hashMock = bcrypt.hash as unknown as jest.Mock;
    hashMock.mockClear();
    const { prisma } = buildPrisma({
      userCreate: jest.fn().mockRejectedValue(uniqueViolation(["email"])),
    });

    // Mesmo no caminho de e-mail repetido (409) o bcrypt já rodou antes da transação.
    await expect(new SignupService(prisma).signup(DTO)).rejects.toBeInstanceOf(ConflictException);

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

    await new SignupService(prisma).signup(DTO);

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

      const attempt = new SignupService(prisma).signup({ ...DTO, acceptedTermsVersion: version });

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

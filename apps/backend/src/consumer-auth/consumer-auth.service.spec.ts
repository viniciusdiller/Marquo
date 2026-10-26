import { BadRequestException, ConflictException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { passwordVersion } from "./types/consumer-auth-user";
import { ConsumerAuthService } from "./consumer-auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConsumerEmailCodeService, RegisterCodeMode } from "./consumer-email-code.service";

const CORRECT_PASSWORD = "senha-correta-123";
// bcrypt de verdade (não mockado): o timing/comparação é parte do que os testes de lockout
// verificam — mockar bcrypt.compare esconderia justamente o que precisa ser testado.
const PASSWORD_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 4);

const PHONE = "11988887777";

const BASE_CONSUMER = {
  id: "c-1",
  phone: PHONE,
  name: "Ana",
  email: "ana@example.com",
  passwordHash: PASSWORD_HASH as string | null,
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

// Simula a semântica de UPDATE ... SET x = x + 1 (estado mutável compartilhado entre
// chamadas), senão o teste de corrida não pega a regressão de lockout sob concorrência.
function build(
  initialConsumer: Record<string, unknown> | null = null,
  over: Record<string, unknown> = {},
  codeMode: RegisterCodeMode = "skip",
) {
  const state: Record<string, unknown> = initialConsumer ? { ...initialConsumer } : {};
  const prisma: Record<string, unknown> = {
    consumer: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(initialConsumer ? { ...state } : null)),
      findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ ...state })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "c-new", ...data })),
      update: jest.fn().mockImplementation(({ data }) => {
        const increment = data.failedLoginAttempts?.increment;
        if (typeof increment === "number") {
          state.failedLoginAttempts = ((state.failedLoginAttempts as number) ?? 0) + increment;
        } else if ("failedLoginAttempts" in data) {
          state.failedLoginAttempts = data.failedLoginAttempts;
        }
        if ("lockedUntil" in data) state.lockedUntil = data.lockedUntil;
        if ("passwordHash" in data) state.passwordHash = data.passwordHash;
        if ("email" in data) state.email = data.email;
        if ("name" in data) state.name = data.name;
        return Promise.resolve({ ...state });
      }),
      delete: jest.fn(),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: "cl-1", name: "Ana", phone: PHONE }),
      update: jest.fn(),
    },
    consumerTenantLink: { upsert: jest.fn() },
    consumerSession: {
      create: jest.fn().mockResolvedValue({ id: "session-new" }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...over,
  };
  prisma.$transaction = jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  const jwt = { sign: jest.fn().mockReturnValue("tok") } as unknown as JwtService;
  // Padrão "skip" (e-mail desligado, desenvolvimento): o cadastro não exige código e os testes antigos seguem valendo.
  const emailCodes = { mode: jest.fn().mockReturnValue(codeMode), check: jest.fn().mockReturnValue("ok"), consume: jest.fn() };
  return {
    service: new ConsumerAuthService(prisma as unknown as PrismaService, jwt, emailCodes as unknown as ConsumerEmailCodeService),
    prisma: prisma as any,
    jwt,
    emailCodes,
  };
}

describe("ConsumerAuthService.login", () => {
  it("rejeita telefone inexistente com a mesma UnauthorizedException genérica de senha errada", async () => {
    const { service } = build(null);
    await expect(service.login({ identifier: PHONE, password: "qualquer" })).rejects.toThrow(
      new UnauthorizedException("Credenciais inválidas."),
    );
  });

  it("aceita e-mail (case-insensitive) como identificador", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    const result = await service.login({ identifier: " ANA@Example.com ", password: CORRECT_PASSWORD });
    expect(result.accessToken).toBe("tok");
    expect(prisma.consumer.findUnique).toHaveBeenCalledWith({ where: { email: "ana@example.com" } });
  });

  it("aceita telefone formatado como identificador", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await service.login({ identifier: "(11) 98888-7777", password: CORRECT_PASSWORD });
    expect(prisma.consumer.findUnique).toHaveBeenCalledWith({ where: { phone: PHONE } });
  });

  // Regressão: um telefone implausível virar 400 "telefone inválido" diferenciaria esse caso de
  // "senha errada"/"conta inexistente" — o login unificado tem que devolver sempre o mesmo 401.
  it("identificador malformado cai no mesmo 401 genérico (nunca 400)", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await expect(service.login({ identifier: "123", password: "qualquer" })).rejects.toThrow(
      new UnauthorizedException("Credenciais inválidas."),
    );
    expect(prisma.consumer.findUnique).not.toHaveBeenCalled();
  });

  // Regressão: conta sem senha (ainda não reivindicada) tem que ser indistinguível de conta
  // inexistente no login; quem reivindica é o cadastro.
  it("rejeita conta sem senha (não migrada) com o mesmo 401 genérico", async () => {
    const { service } = build({ ...BASE_CONSUMER, passwordHash: null });
    await expect(service.login({ identifier: PHONE, password: "qualquer" })).rejects.toThrow(
      new UnauthorizedException("Credenciais inválidas."),
    );
  });

  it("rejeita senha errada e incrementa failedLoginAttempts atomicamente", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await expect(service.login({ identifier: PHONE, password: "errada" })).rejects.toThrow(UnauthorizedException);
    expect(prisma.consumer.update).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
  });

  it("trava a conta na 5ª tentativa errada seguida", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER, failedLoginAttempts: 4 });
    await expect(service.login({ identifier: PHONE, password: "errada" })).rejects.toThrow(UnauthorizedException);
    const calls = prisma.consumer.update.mock.calls;
    expect(calls[0][0].data).toEqual({ failedLoginAttempts: { increment: 1 } });
    expect(calls[1][0].data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  // Regressão (mesma do login de staff): ler-somar-gravar perdia tentativas sob força bruta
  // paralela e o lockout nunca disparava.
  it("incrementa corretamente sob duas tentativas concorrentes", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await Promise.all([
      service.login({ identifier: PHONE, password: "errada-1" }).catch(() => {}),
      service.login({ identifier: PHONE, password: "errada-2" }).catch(() => {}),
    ]);
    const finalState = await prisma.consumer.findUnique();
    expect(finalState.failedLoginAttempts).toBe(2);
  });

  it("rejeita a SENHA CORRETA enquanto travada, sem tocar no contador", async () => {
    const { service, prisma } = build({
      ...BASE_CONSUMER,
      failedLoginAttempts: 6,
      lockedUntil: new Date(Date.now() + 5 * 60_000),
    });
    await expect(service.login({ identifier: PHONE, password: CORRECT_PASSWORD })).rejects.toThrow(
      UnauthorizedException,
    );
    // Senão um atacante mantém a conta bloqueada pra sempre martelando durante a janela.
    expect(prisma.consumer.update).not.toHaveBeenCalled();
  });

  it("permite login depois que lockedUntil passou e reseta o contador", async () => {
    const { service, prisma } = build({
      ...BASE_CONSUMER,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() - 1000),
    });
    const result = await service.login({ identifier: PHONE, password: CORRECT_PASSWORD });
    expect(result.accessToken).toBe("tok");
    expect(prisma.consumer.update).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it("login bem-sucedido sem falhas anteriores não chama update à toa", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await service.login({ identifier: PHONE, password: CORRECT_PASSWORD });
    expect(prisma.consumer.update).not.toHaveBeenCalled();
  });
});

describe("ConsumerAuthService.register (cadastro e reivindicação)", () => {
  const dto = {
    name: "Ana",
    phone: PHONE,
    email: "Ana@Example.com",
    password: CORRECT_PASSWORD,
    consent: true,
  };

  it("sem consentimento é rejeitado", async () => {
    const { service } = build(null);
    await expect(service.register({ ...dto, consent: false })).rejects.toThrow(BadRequestException);
  });

  it("conta que já tem senha lança Conflict e não altera nada", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await expect(service.register(dto)).rejects.toThrow(ConflictException);
    expect(prisma.consumer.update).not.toHaveBeenCalled();
  });

  it("e-mail já usado por OUTRO consumidor lança Conflict", async () => {
    const { service, prisma } = build(null);
    prisma.consumer.findUnique.mockImplementation(({ where }: { where: Record<string, string> }) =>
      Promise.resolve(where.email ? { id: "outro" } : null),
    );
    await expect(service.register(dto)).rejects.toThrow(ConflictException);
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it("normaliza telefone/e-mail, grava só o HASH da senha e o consentimento", async () => {
    const { service, prisma } = build(null);
    const result = await service.register({ ...dto, phone: "+55 (11) 98888-7777" });
    const data = prisma.consumer.create.mock.calls[0][0].data;
    expect(data.phone).toBe(PHONE);
    expect(data.email).toBe("ana@example.com");
    expect(data.passwordHash).not.toBe(CORRECT_PASSWORD);
    expect(await bcrypt.compare(CORRECT_PASSWORD, data.passwordHash)).toBe(true);
    expect(data.consentedAt).toBeInstanceOf(Date);
    expect(result.accessToken).toBe("tok");
  });

  it("reivindica um Consumer antigo sem senha (mantém o nome) e faz o backfill", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER, passwordHash: null, email: null });
    prisma.client.findMany.mockResolvedValue([
      { id: "cl-a", tenantId: "t-a" },
      { id: "cl-b", tenantId: "t-b" },
    ]);
    await service.register({ ...dto, name: "Outro Nome" });
    const data = prisma.consumer.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("name");
    expect(await bcrypt.compare(CORRECT_PASSWORD, data.passwordHash)).toBe(true);
    expect(prisma.consumerTenantLink.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it("reivindica histórico só de Client (sem Consumer): cria a conta e liga todos os salões", async () => {
    const { service, prisma } = build(null);
    prisma.client.findMany.mockResolvedValue([{ id: "cl-a", tenantId: "t-a" }]);
    await service.register(dto);
    expect(prisma.consumer.create).toHaveBeenCalled();
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: PHONE } }),
    );
    expect(prisma.consumerTenantLink.upsert).toHaveBeenCalledTimes(1);
  });

  // Regressão de escopo: o backfill é em lote, entre vários tenants — não pode sobrescrever o
  // nome que a ficha de cada salão guarda (ensureLink, de propósito, resincroniza; este não).
  it("o backfill nunca altera Client.name de nenhum tenant", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER, passwordHash: null });
    prisma.client.findMany.mockResolvedValue([{ id: "cl-a", tenantId: "t-a" }]);
    await service.register(dto);
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.client.upsert).not.toHaveBeenCalled();
  });
});

describe("ConsumerAuthService.changePassword / updateProfile", () => {
  const auth = { consumerId: "c-1", sessionId: "session-current" };

  it("recusa senha atual incorreta", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await expect(
      service.changePassword(auth, { currentPassword: "errada", newPassword: "nova-senha-123" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.consumer.update).not.toHaveBeenCalled();
    expect(prisma.consumerSession.updateMany).not.toHaveBeenCalled();
  });

  it("troca a senha (só o hash) quando a atual confere", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await service.changePassword(auth, { currentPassword: CORRECT_PASSWORD, newPassword: "nova-senha-123" });
    const hash = prisma.consumer.update.mock.calls[0][0].data.passwordHash;
    expect(hash).not.toBe("nova-senha-123");
    expect(await bcrypt.compare("nova-senha-123", hash)).toBe(true);
  });

  // Regressão: token de 30 dias sobrevivia à troca de senha. Agora, além da versão da senha no
  // token, TODOS os dispositivos são revogados na tabela e um novo (para quem trocou) é criado.
  it("troca de senha revoga todas as sessões e devolve uma sessão nova com a versão da NOVA senha", async () => {
    const { service, prisma, jwt } = build({ ...BASE_CONSUMER });
    const result = await service.changePassword(auth, {
      currentPassword: CORRECT_PASSWORD,
      newPassword: "nova-senha-123",
    });
    const newHash = prisma.consumer.update.mock.calls[0][0].data.passwordHash;
    const payload = (jwt.sign as jest.Mock).mock.calls[0][0];

    expect(prisma.consumerSession.updateMany).toHaveBeenCalledWith({
      where: { consumerId: "c-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // A sessão nova só pode ser criada DEPOIS da revogação em massa, senão ela mesma seria
    // revogada (mesmo filtro revokedAt: null casaria com ela).
    const revokeOrder = (prisma.consumerSession.updateMany as jest.Mock).mock.invocationCallOrder[0];
    const createOrder = (prisma.consumerSession.create as jest.Mock).mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(createOrder);

    expect(result.accessToken).toBe("tok");
    expect(payload).toEqual({ sub: "c-1", type: "consumer", pv: passwordVersion(newHash), sid: "session-new" });
    expect(payload.pv).not.toBe(passwordVersion(BASE_CONSUMER.passwordHash as string));
  });

  it("updateProfile normaliza e-mail e nunca aceita telefone", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    await service.updateProfile(auth, { name: " Ana Maria ", email: "NOVA@Example.com" });
    const data = prisma.consumer.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: "Ana Maria", email: "nova@example.com" });
    expect(data).not.toHaveProperty("phone");
  });
});

describe("ConsumerAuthService.refresh", () => {
  const auth = { consumerId: "c-1", sessionId: "session-1" };

  // Chamado pelo proxy.ts perto do vencimento do token — é o que faz a sessão "nunca sair"
  // enquanto o cliente volta ao site dentro da janela.
  it("estende expiresAt/lastSeenAt e assina um token novo com o MESMO sid", async () => {
    const { service, prisma, jwt } = build({ ...BASE_CONSUMER });
    (prisma.consumerSession.update as jest.Mock).mockResolvedValue({
      id: "session-1",
      consumer: BASE_CONSUMER,
    });

    const result = await service.refresh(auth);

    expect(prisma.consumerSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { lastSeenAt: expect.any(Date), expiresAt: expect.any(Date) },
      include: { consumer: { select: { id: true, name: true, phone: true, email: true, passwordHash: true } } },
    });
    expect(result.accessToken).toBe("tok");
    expect((jwt.sign as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ sub: "c-1", sid: "session-1" }),
    );
  });
});

describe("ConsumerAuthService.listSessions", () => {
  it("lista só sessões ativas do próprio consumidor e marca a atual", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    (prisma.consumerSession.findMany as jest.Mock).mockResolvedValue([
      { id: "session-1", userAgent: "Chrome", createdAt: new Date(), lastSeenAt: new Date() },
      { id: "session-2", userAgent: "Safari", createdAt: new Date(), lastSeenAt: new Date() },
    ]);

    const result = await service.listSessions({ consumerId: "c-1", sessionId: "session-2" });

    expect(prisma.consumerSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { consumerId: "c-1", revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: "session-1", current: false }),
      expect.objectContaining({ id: "session-2", current: true }),
    ]);
  });
});

describe("ConsumerAuthService.revokeSession / revokeOtherSessions", () => {
  const auth = { consumerId: "c-1", sessionId: "session-atual" };

  // Regressão (IDOR): dono no WHERE, nunca busca por id e compara depois — sessão de outro
  // consumidor cai no mesmo NotFoundException de "não existe".
  it("revokeSession filtra por consumerId no WHERE e lança NotFound se não achar/não for dono", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    (prisma.consumerSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(service.revokeSession(auth, "session-de-outro")).rejects.toThrow(
      new Error("Sessão não encontrada."),
    );
    expect(prisma.consumerSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session-de-outro", consumerId: "c-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokeSession confirma quando a sessão pertence ao consumidor", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    (prisma.consumerSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    await expect(service.revokeSession(auth, "session-2")).resolves.toEqual({ revoked: true });
  });

  it("revokeOtherSessions nunca inclui a própria sessão em uso no WHERE", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    (prisma.consumerSession.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.revokeOtherSessions(auth);

    expect(prisma.consumerSession.updateMany).toHaveBeenCalledWith({
      where: { consumerId: "c-1", revokedAt: null, id: { not: "session-atual" } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({ revoked: 2 });
  });
});

describe("ConsumerAuthService.cleanupExpiredSessions", () => {
  const NOW = new Date("2026-09-23T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Regressão: sessão viva (nunca revogada, ainda não expirada) não pode ser apagada, não
  // importa a idade — só revokedAt/expiresAt antigos indicam que a sessão está morta há tempo.
  it("apaga só sessão revogada ou expirada há mais de 90 dias, nunca uma ativa", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    (prisma.consumerSession.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

    const removed = await service.cleanupExpiredSessions();

    const cutoff = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(prisma.consumerSession.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ revokedAt: { lt: cutoff } }, { AND: [{ revokedAt: null }, { expiresAt: { lt: cutoff } }] }],
      },
    });
    expect(removed).toBe(3);
  });
});

describe("ConsumerAuthService.listEstablishments", () => {
  // Regressão: o "me" devolvia todos os salões do consumidor de uma vez. Agora a lista é
  // paginada no banco e restrita ao consumerId autenticado.
  it("pagina os vínculos do próprio consumidor e devolve só os dados públicos do salão", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    prisma.consumerTenantLink.count = jest.fn().mockResolvedValue(25);
    prisma.consumerTenantLink.findMany = jest
      .fn()
      .mockResolvedValue([{ tenant: { name: "Salão A", slug: "a", logoUrl: null } }]);

    const result = await service.listEstablishments(
      { consumerId: "c-1", sessionId: "session-1" },
      { page: 2, pageSize: 12 },
    );

    expect(prisma.consumerTenantLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { consumerId: "c-1" }, skip: 12, take: 12 }),
    );
    expect(result).toMatchObject({
      items: [{ name: "Salão A", slug: "a", logoUrl: null }],
      total: 25,
      page: 2,
      pageCount: 3,
    });
  });
});

describe("ConsumerAuthService.ensureLink", () => {
  it("faz upsert de client e vínculo usando o client recebido (participa da transação de quem chama)", async () => {
    const { service, prisma } = build({ ...BASE_CONSUMER });
    const tx = {
      consumer: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "c-1", name: "Ana", phone: PHONE }) },
      client: { upsert: jest.fn().mockResolvedValue({ id: "cl-1" }) },
      consumerTenantLink: { upsert: jest.fn() },
    };
    await service.ensureLink(tx as never, "c-1", "t-1");
    expect(tx.client.upsert).toHaveBeenCalled();
    expect(tx.consumerTenantLink.upsert).toHaveBeenCalled();
    expect(prisma.client.upsert).not.toHaveBeenCalled();
  });
});

describe("ConsumerAuthService.register: código de confirmação do e-mail", () => {
  const dto = { name: "Ana", phone: PHONE, email: "Ana@Example.com", password: CORRECT_PASSWORD, consent: true };

  it("com e-mail configurado e código CERTO: cadastra e consome o código (uso único)", async () => {
    const { service, emailCodes, prisma } = build(null, {}, "required");
    await service.register({ ...dto, emailCode: "123456" });

    expect(emailCodes.check).toHaveBeenCalledWith("ana@example.com", "123456");
    expect(prisma.consumer.create).toHaveBeenCalledTimes(1);
    expect(emailCodes.consume).toHaveBeenCalledWith("ana@example.com");
  });

  it("código errado, vencido ou ausente: 400 ANTES de qualquer custo (nem bcrypt nem banco) e nada é criado", async () => {
    for (const emailCode of ["000000", undefined]) {
      const { service, emailCodes, prisma } = build(null, {}, "required");
      emailCodes.check.mockReturnValue("invalid");
      await expect(service.register({ ...dto, emailCode })).rejects.toThrow(BadRequestException);
      expect(prisma.consumer.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(emailCodes.consume).not.toHaveBeenCalled();
    }
  });

  it("código ausente é conferido como string vazia (nunca passa por 'undefined == ok')", async () => {
    const { service, emailCodes } = build(null, {}, "required");
    emailCodes.check.mockReturnValue("invalid");
    await service.register({ ...dto }).catch(() => undefined);
    expect(emailCodes.check).toHaveBeenCalledWith("ana@example.com", "");
  });

  it("código travado/expirado também é recusado", async () => {
    for (const result of ["expired", "locked"]) {
      const { service, emailCodes } = build(null, {}, "required");
      emailCodes.check.mockReturnValue(result);
      await expect(service.register({ ...dto, emailCode: "123456" })).rejects.toThrow(BadRequestException);
    }
  });

  it("sem e-mail configurado em desenvolvimento: não exige código e não o consome", async () => {
    const { service, emailCodes } = build(null, {}, "skip");
    await expect(service.register(dto)).resolves.toBeDefined();
    expect(emailCodes.check).not.toHaveBeenCalled();
    expect(emailCodes.consume).not.toHaveBeenCalled();
  });

  it("sem e-mail em PRODUÇÃO: recusa o cadastro (503), fail closed", async () => {
    const { service, prisma } = build(null, {}, "unavailable");
    await expect(service.register(dto)).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it("cadastro que falha depois do código (telefone já tem conta: 409) NÃO consome o código", async () => {
    const { service, emailCodes } = build({ ...BASE_CONSUMER }, {}, "required");
    await expect(service.register({ ...dto, emailCode: "123456" })).rejects.toThrow(ConflictException);
    expect(emailCodes.consume).not.toHaveBeenCalled();
  });
});

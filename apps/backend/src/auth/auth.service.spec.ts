import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { Role } from "@marquo/database";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";

const CORRECT_PASSWORD = "senha-correta-123";
// bcrypt de verdade (não mockado) — o próprio comportamento de timing/comparação é parte do
// que os testes de lockout/timing-attack abaixo verificam, então mockar bcrypt.compare
// esconderia justamente o que precisa ser testado.
const PASSWORD_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 4); // rounds baixo só nos testes, cost não importa aqui

// Mantém um "estado de linha" mutável e compartilhado entre chamadas — precisa simular de
// verdade a semântica de UPDATE ... SET x = x + 1 do Postgres (não só devolver o que foi
// passado), senão o teste de corrida em "incrementa corretamente sob login concorrente"
// não pega a regressão que motivou a correção (ver auth.service.ts:registerFailedLogin).
function buildPrisma(initialUser: Record<string, unknown> | null = null) {
  const state: Record<string, unknown> = initialUser ? { ...initialUser } : {};
  return {
    user: {
      findUnique: jest.fn().mockImplementation(() =>
        Promise.resolve(initialUser ? { ...state } : null),
      ),
      update: jest.fn().mockImplementation(({ data }) => {
        const increment = data.failedLoginAttempts?.increment;
        if (typeof increment === "number") {
          state.failedLoginAttempts = ((state.failedLoginAttempts as number) ?? 0) + increment;
        } else if ("failedLoginAttempts" in data) {
          state.failedLoginAttempts = data.failedLoginAttempts;
        }
        if ("lockedUntil" in data) {
          state.lockedUntil = data.lockedUntil;
        }
        return Promise.resolve({ id: "u-1", ...state });
      }),
    },
  } as unknown as PrismaService;
}

function buildJwtService(overrides: Record<string, unknown> = {}) {
  return {
    sign: jest.fn().mockReturnValue("signed-token"),
    verify: jest.fn(),
    ...overrides,
  } as any;
}

// RefreshTokenService é testado à parte (refresh-token.service.spec.ts); aqui só o contrato que o AuthService usa.
function buildRefreshTokens() {
  return {
    issue: jest.fn().mockResolvedValue("novo-refresh-token"),
    consume: jest.fn().mockResolvedValue({ familyId: "fam-1", familyStartedAt: new Date("2026-09-01T00:00:00Z") }),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    purgeExpired: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const ACTIVE_USER = {
  id: "u-1",
  tenantId: "t-1",
  role: Role.OWNER,
  email: "dono@salaodemo.com",
  name: "Dona Marta",
  isActive: true,
  professional: null,
  passwordHash: PASSWORD_HASH,
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

describe("AuthService.login", () => {
  it("rejeita e-mail inexistente com a mesma UnauthorizedException genérica", async () => {
    const prisma = buildPrisma(null);
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await expect(
      service.login({ email: "nao-existe@example.com", password: "qualquer" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejeita usuário desativado", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER, isActive: false });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await expect(
      service.login({ email: ACTIVE_USER.email, password: CORRECT_PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejeita senha errada e incrementa failedLoginAttempts", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await expect(
      service.login({ email: ACTIVE_USER.email, password: "senha-errada" }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    const updated = await (prisma.user.update as jest.Mock).mock.results[0].value;
    expect(updated.failedLoginAttempts).toBe(1);
  });

  it("trava a conta (lockedUntil no futuro) na 5ª tentativa errada seguida", async () => {
    const prisma = buildPrisma({
      ...ACTIVE_USER,
      failedLoginAttempts: 4, // essa vai ser a 5ª
    });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await expect(
      service.login({ email: ACTIVE_USER.email, password: "senha-errada" }),
    ).rejects.toThrow(UnauthorizedException);

    // Primeiro update: incremento atômico. Segundo update: trava, já sabendo o valor
    // pós-incremento (não recalculado a partir de uma leitura antiga).
    const calls = (prisma.user.update as jest.Mock).mock.calls;
    expect(calls[0][0].data).toEqual({ failedLoginAttempts: { increment: 1 } });
    expect(calls[1][0].data.lockedUntil).toBeInstanceOf(Date);
    expect(calls[1][0].data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  // Regressão: registerFailedLogin calculava `currentAttempts + 1` a partir do valor lido
  // no início de login() e escrevia esse valor absoluto de volta. Duas chamadas concorrentes
  // (IPs diferentes, força bruta em paralelo — exatamente o que o lockout existe pra barrar)
  // liam o mesmo valor antes de qualquer escrita confirmar, então o contador só avançava +1
  // no total em vez de +2 — o lockout nunca disparava sob tentativa paralela. Com o
  // incremento atômico (`{ increment: 1 }`), cada chamada soma corretamente independente de
  // quando cada uma leu o estado.
  it("incrementa corretamente sob duas tentativas de login concorrentes (mesma conta)", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER, failedLoginAttempts: 0 });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await Promise.all([
      service.login({ email: ACTIVE_USER.email, password: "errada-1" }).catch(() => {}),
      service.login({ email: ACTIVE_USER.email, password: "errada-2" }).catch(() => {}),
    ]);

    const finalState = await (prisma.user.findUnique as jest.Mock)();
    expect(finalState.failedLoginAttempts).toBe(2);
  });

  it("rejeita login com a SENHA CORRETA enquanto a conta está travada, sem resetar o contador", async () => {
    const prisma = buildPrisma({
      ...ACTIVE_USER,
      failedLoginAttempts: 6,
      lockedUntil: new Date(Date.now() + 5 * 60_000),
    });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    // Mesma senha que funcionaria se a conta não estivesse travada.
    await expect(
      service.login({ email: ACTIVE_USER.email, password: CORRECT_PASSWORD }),
    ).rejects.toThrow(UnauthorizedException);

    // Não é só "não expira token" — não deve nem tocar failedLoginAttempts/lockedUntil
    // enquanto travada (senão dava pra um atacante manter a conta bloqueada pra sempre
    // martelando durante a janela).
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("permite login normalmente depois que lockedUntil já passou", async () => {
    const prisma = buildPrisma({
      ...ACTIVE_USER,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() - 1000), // já expirou
    });
    const jwtService = buildJwtService();
    const service = new AuthService(prisma, jwtService, buildRefreshTokens());

    const result = await service.login({ email: ACTIVE_USER.email, password: CORRECT_PASSWORD });

    expect(result.accessToken).toBe("signed-token");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it("login bem-sucedido reseta failedLoginAttempts pra 0", async () => {
    const prisma = buildPrisma({
      ...ACTIVE_USER,
      failedLoginAttempts: 3,
    });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await service.login({ email: ACTIVE_USER.email, password: CORRECT_PASSWORD });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it("login bem-sucedido sem tentativas falhas anteriores não chama update à toa", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await service.login({ email: ACTIVE_USER.email, password: CORRECT_PASSWORD });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("AuthService.refresh", () => {
  it("rejeita refresh token inválido/expirado", async () => {
    const jwtService = buildJwtService({
      verify: jest.fn().mockImplementation(() => {
        throw new Error("jwt expired");
      }),
    });
    const service = new AuthService(buildPrisma(), jwtService, buildRefreshTokens());

    await expect(service.refresh({ refreshToken: "garbage" })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejeita token sem claim type: refresh (ex.: access token reaproveitado)", async () => {
    const jwtService = buildJwtService({
      verify: jest.fn().mockReturnValue({ sub: "u-1", tenantId: "t-1", role: Role.OWNER }),
    });
    const service = new AuthService(buildPrisma(), jwtService, buildRefreshTokens());

    await expect(service.refresh({ refreshToken: "access-token" })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejeita quando o usuário não existe mais ou foi desativado", async () => {
    const jwtService = buildJwtService({
      verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh" }),
    });
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...ACTIVE_USER, isActive: false });
    const service = new AuthService(prisma, jwtService, buildRefreshTokens());

    await expect(service.refresh({ refreshToken: "valid-but-user-deactivated" })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("emite um novo access token revalidando o usuário no banco (não confia nas claims antigas)", async () => {
    const jwtService = buildJwtService({
      verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh" }),
    });
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(ACTIVE_USER);
    const service = new AuthService(prisma, jwtService, buildRefreshTokens());

    const result = await service.refresh({ refreshToken: "valid" });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u-1" },
      include: { professional: true },
    });
    expect(result.accessToken).toBe("signed-token");
    expect(result.refreshToken).toBe("novo-refresh-token");
    expect(result.user).toMatchObject({ id: "u-1", tenantId: "t-1", role: Role.OWNER });
  });
});

describe("AuthService.setPassword", () => {
  const validInvite = {
    ...ACTIVE_USER,
    passwordSetTokenExpiresAt: new Date(Date.now() + 60_000),
  };

  it("resgata o convite de um usuário ativo e devolve sessão", async () => {
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(validInvite);
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    const result = await service.setPassword({ token: "convite", password: "nova-senha-123" });

    expect(result.accessToken).toBe("signed-token");
  });

  // Regressão: setPassword devolve tokens de sessão, então um convite ainda válido de um
  // usuário que o dono desativou reabria o acesso à conta.
  it("rejeita o convite de um usuário desativado, sem emitir sessão", async () => {
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...validInvite, isActive: false });
    const jwt = buildJwtService();
    const service = new AuthService(prisma, jwt, buildRefreshTokens());

    await expect(
      service.setPassword({ token: "convite", password: "nova-senha-123" }),
    ).rejects.toThrow(BadRequestException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});

// Recuperar a conta (link de redefinição gerado pelo suporte) precisa derrubar as sessões antigas:
// o refresh token de staff dura 30 dias e não era revogável por nenhum outro meio.
describe("AuthService: sessões antigas caem depois da redefinição de senha", () => {
  const changedAt = new Date("2026-09-24T12:00:00Z");
  const changedAtSec = Math.floor(changedAt.getTime() / 1000);

  it("setPassword grava passwordChangedAt e zera o bloqueio por tentativas", async () => {
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...ACTIVE_USER,
      failedLoginAttempts: 7,
      lockedUntil: new Date(Date.now() + 60_000),
      passwordSetTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    const service = new AuthService(prisma, buildJwtService(), buildRefreshTokens());

    await service.setPassword({ token: "convite", password: "nova-senha-123" });

    const data = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null, passwordSetTokenHash: null });
  });

  it("refresh token emitido ANTES da redefinição não renova a sessão", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER, passwordChangedAt: changedAt });
    const jwt = buildJwtService({
      verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh", iat: changedAtSec - 3600 }),
    });

    await expect(new AuthService(prisma, jwt, buildRefreshTokens()).refresh({ refreshToken: "antigo" })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it("refresh token emitido DEPOIS (ou no mesmo segundo) da redefinição continua valendo", async () => {
    for (const iat of [changedAtSec, changedAtSec + 60]) {
      const prisma = buildPrisma({ ...ACTIVE_USER, passwordChangedAt: changedAt });
      const jwt = buildJwtService({ verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh", iat }) });

      await expect(new AuthService(prisma, jwt, buildRefreshTokens()).refresh({ refreshToken: "novo" })).resolves.toMatchObject({
        accessToken: "signed-token",
      });
    }
  });

  it("conta que nunca trocou a senha não é afetada", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER, passwordChangedAt: null });
    const jwt = buildJwtService({ verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh", iat: 1 }) });

    await expect(new AuthService(prisma, jwt, buildRefreshTokens()).refresh({ refreshToken: "qualquer" })).resolves.toBeDefined();
  });
});

describe("AuthService: rotação do refresh token", () => {
  it("refresh gasta o token DEPOIS das outras checagens e emite o sucessor na mesma família", async () => {
    const prisma = buildPrisma(ACTIVE_USER);
    const refreshTokens = buildRefreshTokens();
    const payload = { sub: "u-1", type: "refresh", jti: "j-1", fid: "fam-1", iat: 1 };
    const jwt = buildJwtService({ verify: jest.fn().mockReturnValue(payload) });

    const result = await new AuthService(prisma, jwt, refreshTokens).refresh({ refreshToken: "t" });

    expect(refreshTokens.consume).toHaveBeenCalledWith(payload);
    expect(refreshTokens.issue).toHaveBeenCalledWith("u-1", { familyId: "fam-1", familyStartedAt: expect.any(Date) });
    expect(result.refreshToken).toBe("novo-refresh-token");
  });

  // Se o usuário foi desativado, gastar o token só queimaria o registro sem devolver nada útil — e uma
  // checagem que falha depois de gastar o token poderia deslogar uma sessão legítima por engano.
  it("usuário desativado: nem chega a gastar o token", async () => {
    const prisma = buildPrisma({ ...ACTIVE_USER, isActive: false });
    const refreshTokens = buildRefreshTokens();
    const jwt = buildJwtService({ verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh", jti: "j", fid: "f" }) });

    await expect(new AuthService(prisma, jwt, refreshTokens).refresh({ refreshToken: "t" })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshTokens.consume).not.toHaveBeenCalled();
  });

  it("token reutilizado (consume recusa) → 401 e nada é emitido", async () => {
    const prisma = buildPrisma(ACTIVE_USER);
    const refreshTokens = buildRefreshTokens();
    refreshTokens.consume.mockRejectedValue(new UnauthorizedException("Sessão expirada. Faça login novamente."));
    const jwt = buildJwtService({ verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh", jti: "j", fid: "f" }) });

    await expect(new AuthService(prisma, jwt, refreshTokens).refresh({ refreshToken: "t" })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshTokens.issue).not.toHaveBeenCalled();
  });

  it("login começa uma família nova (issue sem família) e limpa tokens vencidos do usuário", async () => {
    const prisma = buildPrisma(ACTIVE_USER);
    const refreshTokens = buildRefreshTokens();

    await new AuthService(prisma, buildJwtService(), refreshTokens).login({ email: ACTIVE_USER.email, password: CORRECT_PASSWORD });

    expect(refreshTokens.purgeExpired).toHaveBeenCalledWith("u-1");
    expect(refreshTokens.issue).toHaveBeenCalledWith("u-1", undefined);
  });

  it("setPassword revoga TODAS as sessões anteriores do usuário antes de emitir a nova", async () => {
    const prisma = buildPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...ACTIVE_USER,
      passwordSetTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    const refreshTokens = buildRefreshTokens();

    await new AuthService(prisma, buildJwtService(), refreshTokens).setPassword({ token: "convite", password: "nova-senha-123" });

    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith("u-1");
    const revokeOrder = refreshTokens.revokeAllForUser.mock.invocationCallOrder[0];
    const issueOrder = refreshTokens.issue.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(issueOrder);
  });
});

describe("AuthService.logout", () => {
  it("revoga a família do refresh token", async () => {
    const refreshTokens = buildRefreshTokens();
    const jwt = buildJwtService({ verify: jest.fn().mockReturnValue({ sub: "u-1", type: "refresh", jti: "j", fid: "fam-9" }) });

    await new AuthService(buildPrisma(), jwt, refreshTokens).logout("t");

    expect(refreshTokens.revokeFamily).toHaveBeenCalledWith("fam-9");
  });

  it("não vaza nada: token inválido, vencido ou de outro tipo termina igual, sem lançar", async () => {
    const refreshTokens = buildRefreshTokens();
    const boom = buildJwtService({ verify: jest.fn().mockImplementation(() => { throw new Error("jwt expired"); }) });
    await expect(new AuthService(buildPrisma(), boom, refreshTokens).logout("lixo")).resolves.toBeUndefined();

    const access = buildJwtService({ verify: jest.fn().mockReturnValue({ sub: "u-1", role: Role.OWNER }) });
    await expect(new AuthService(buildPrisma(), access, refreshTokens).logout("access")).resolves.toBeUndefined();
    expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
  });
});

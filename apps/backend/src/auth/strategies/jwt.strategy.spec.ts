import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Role } from "@marquo/database";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtStrategy } from "./jwt.strategy";

const CHANGED = new Date("2026-09-24T12:00:00Z");
const CHANGED_SEC = Math.floor(CHANGED.getTime() / 1000);

function build(user: Record<string, unknown> | null) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } } as unknown as PrismaService;
  const config = { getOrThrow: () => "x".repeat(40) } as unknown as ConfigService;
  return { strategy: new JwtStrategy(config, prisma), prisma };
}

const ROW = { tenantId: "t-1", role: Role.OWNER, isActive: true, emailVerifiedAt: new Date("2026-01-01"), passwordChangedAt: null, professional: null };
const payload = (over: Record<string, unknown> = {}) => ({ sub: "u-1", tenantId: "t-1", role: Role.OWNER, iat: CHANGED_SEC, ...over });

describe("JwtStrategy.validate: sessão depois da redefinição de senha", () => {
  it("access token emitido antes da redefinição deixa de valer (401)", async () => {
    const { strategy } = build({ ...ROW, passwordChangedAt: CHANGED });

    await expect(strategy.validate(payload({ iat: CHANGED_SEC - 60 }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("emitido depois da redefinição vale, e a identidade vem do banco", async () => {
    const { strategy } = build({ ...ROW, passwordChangedAt: CHANGED });

    await expect(strategy.validate(payload({ iat: CHANGED_SEC + 5, tenantId: "forjado" }))).resolves.toMatchObject({
      userId: "u-1",
      tenantId: "t-1",
    });
  });

  it("sem redefinição nada muda; usuário desativado continua 401", async () => {
    await expect(build(ROW).strategy.validate(payload({ iat: 1 }))).resolves.toBeDefined();
    await expect(build({ ...ROW, isActive: false }).strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("JwtStrategy.validate: e-mail não confirmado", () => {
  it("conta sem e-mail confirmado não tem sessão (401), mesmo com token válido", async () => {
    await expect(build({ ...ROW, emailVerifiedAt: null }).strategy.validate(payload({ iat: 1 }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("JwtStrategy.validate: permissões vêm do PERFIL, nunca do token", () => {
  const STAFF = { ...ROW, role: Role.RECEPTIONIST };

  it("o dono é sempre total, com ou sem perfil", async () => {
    const result = await build({ ...ROW, accessProfile: null }).strategy.validate(payload());
    expect(Object.values(result.permissions!).every((level) => level === "EDIT")).toBe(true);
  });

  it("a equipe vale o PERFIL atribuído, lido do banco a cada requisição", async () => {
    const { strategy, prisma } = build({ ...STAFF, accessProfile: { name: "Caixa", permissions: { caixa: "EDIT", comandas: "VIEW" } } });
    const result = await strategy.validate(payload({ role: Role.RECEPTIONIST }));

    expect(result.permissions).toMatchObject({ caixa: "EDIT", comandas: "VIEW", financeiro: "NONE", clientes: "NONE" });
    expect(result.profileName).toBe("Caixa");
    // O perfil vem na MESMA leitura do usuário (sem consulta extra por requisição).
    expect((prisma.user.findUnique as jest.Mock).mock.calls).toHaveLength(1);
    expect((prisma.user.findUnique as jest.Mock).mock.calls[0][0].select.accessProfile).toEqual({ select: { name: true, permissions: true } });
  });

  it("claims de permissão no token são ignoradas: só vale o que está no banco", async () => {
    const { strategy } = build({ ...STAFF, accessProfile: { name: "Caixa", permissions: { caixa: "VIEW" } } });
    const result = await strategy.validate(payload({ role: Role.RECEPTIONIST, permissions: { financeiro: "EDIT" } }));
    expect(result.permissions!.financeiro).toBe("NONE");
    expect(result.permissions!.caixa).toBe("VIEW");
  });

  // JSON estranho no banco só pode TIRAR acesso: nível inválido e área desconhecida viram NONE/somem.
  it("perfil com JSON inválido nunca concede nada a mais", async () => {
    const { strategy } = build({ ...STAFF, accessProfile: { name: "Estranho", permissions: { caixa: "SUPER", plano: "EDIT", financeiro: 1, agenda: "EDIT" } } });
    const result = await strategy.validate(payload({ role: Role.RECEPTIONIST }));
    expect(result.permissions).toMatchObject({ caixa: "NONE", financeiro: "NONE", agenda: "EDIT" });
    expect(Object.keys(result.permissions!)).not.toContain("plano");
  });

  it("perfil com JSON que nem é objeto vira 'sem acesso a nada'", async () => {
    for (const bad of [null, "EDIT", ["caixa"], 42]) {
      const { strategy } = build({ ...STAFF, accessProfile: { name: "Ruim", permissions: bad } });
      const result = await strategy.validate(payload({ role: Role.RECEPTIONIST }));
      expect(Object.values(result.permissions!).every((level) => level === "NONE")).toBe(true);
    }
  });

  it("sem perfil atribuído, vale o perfil padrão do papel (Recepção ou Profissional)", async () => {
    const rec = await build({ ...STAFF, accessProfile: null }).strategy.validate(payload({ role: Role.RECEPTIONIST }));
    expect(rec.permissions).toMatchObject({ caixa: "EDIT", comandas: "EDIT", financeiro_avancado: "NONE", clube: "NONE" });

    const pro = await build({ ...STAFF, role: Role.PROFESSIONAL, accessProfile: null }).strategy.validate(payload({ role: Role.PROFESSIONAL }));
    expect(pro.permissions).toMatchObject({ agenda: "EDIT", caixa: "NONE", comandas: "NONE", financeiro: "NONE" });
  });

  it("mudar o perfil vale na hora: a requisição seguinte já enxerga o nível novo", async () => {
    const row = { ...STAFF, accessProfile: { name: "Caixa", permissions: { caixa: "EDIT" } } };
    const { strategy, prisma } = build(row);
    expect((await strategy.validate(payload({ role: Role.RECEPTIONIST }))).permissions!.caixa).toBe("EDIT");
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...row, accessProfile: { name: "Caixa", permissions: { caixa: "NONE" } } });
    expect((await strategy.validate(payload({ role: Role.RECEPTIONIST }))).permissions!.caixa).toBe("NONE");
  });
});

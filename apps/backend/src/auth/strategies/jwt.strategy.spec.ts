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

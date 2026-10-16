import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";
import { InternalService, PASSWORD_RESET_ACTION, PASSWORD_RESET_TTL_MS } from "./internal.service";

const TENANT = "11111111-1111-4111-8111-111111111111";

function buildPrisma(options: { owner?: unknown; tenants?: unknown[]; total?: number } = {}) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue("owner" in options ? options.owner : { id: "u-owner", email: "dono@salao.com" }),
      update: jest.fn().mockReturnValue({ op: "update-user" }),
    },
    adminAuditLog: { create: jest.fn().mockReturnValue({ op: "audit" }) },
    tenant: {
      findMany: jest.fn().mockResolvedValue(options.tenants ?? []),
      count: jest.fn().mockResolvedValue(options.total ?? 0),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  return prisma;
}

// front: null = FRONTEND_URL não definida (undefined acionaria o valor padrão do parâmetro).
const config = (front: string | null = "https://app.exemplo.com/") =>
  ({ get: (key: string) => (key === "FRONTEND_URL" ? (front ?? undefined) : undefined) }) as unknown as ConfigService;

describe("InternalService.createPasswordResetLink", () => {
  it("guarda só o HASH do token, com validade de 24h, e devolve o link em claro uma vez", async () => {
    const prisma = buildPrisma();
    const before = Date.now();

    const result = await new InternalService(prisma, config()).createPasswordResetLink(TENANT, "suporte@total.com");

    const token = new URL(result.link).searchParams.get("token") as string;
    expect(result.link.startsWith("https://app.exemplo.com/definir-senha?token=")).toBe(true);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const data = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    expect(data.passwordSetTokenHash).toBe(hashPasswordSetToken(token));
    expect(data.passwordSetTokenHash).not.toBe(token);
    expect(JSON.stringify(data)).not.toContain(token); // o token em claro nunca é persistido
    const ttl = data.passwordSetTokenExpiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(PASSWORD_RESET_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(PASSWORD_RESET_TTL_MS + 5000);
    expect(result.ownerEmail).toBe("dono@salao.com");
  });

  it("grava a auditoria na MESMA transação e sem o token", async () => {
    const prisma = buildPrisma();

    const result = await new InternalService(prisma, config()).createPasswordResetLink(TENANT, "suporte@total.com");

    expect(prisma.$transaction).toHaveBeenCalledWith([{ op: "update-user" }, { op: "audit" }]);
    const audit = (prisma.adminAuditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(audit).toEqual({ action: PASSWORD_RESET_ACTION, actor: "suporte@total.com", tenantId: TENANT, targetUserId: "u-owner" });
    const token = new URL(result.link).searchParams.get("token") as string;
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it("só o DONO ATIVO do tenant informado é alvo (nunca profissional, recepção ou desativado)", async () => {
    const prisma = buildPrisma();

    await new InternalService(prisma, config()).createPasswordResetLink(TENANT, "s@t.com");

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, role: "OWNER", isActive: true },
      select: { id: true, email: true },
    });
  });

  it("tenant sem dono ativo: 404 e nada é gravado", async () => {
    const prisma = buildPrisma({ owner: null });

    await expect(new InternalService(prisma, config()).createPasswordResetLink(TENANT, "s@t.com")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cada chamada gera um token novo (o link anterior deixa de valer: o hash é sobrescrito)", async () => {
    const service = new InternalService(buildPrisma(), config());

    const a = await service.createPasswordResetLink(TENANT, "s@t.com");
    const b = await service.createPasswordResetLink(TENANT, "s@t.com");

    expect(a.link).not.toBe(b.link);
  });

  it("usa localhost só quando FRONTEND_URL não está definida (dev)", async () => {
    const result = await new InternalService(buildPrisma(), config(null)).createPasswordResetLink(TENANT, "s@t.com");
    expect(result.link.startsWith("http://localhost:3000/definir-senha?token=")).toBe(true);
  });
});

describe("InternalService.listTenants", () => {
  const ROW = {
    id: TENANT,
    name: "Barbearia do Zé",
    slug: "barbearia-do-ze",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
    subscription: null,
    users: [{ email: "ze@x.com", name: "Zé" }],
  };

  it("resume cada tenant com o estado de cobrança, sem ids de provedor nem hashes", async () => {
    const prisma = buildPrisma({ tenants: [ROW], total: 1 });

    const page = await new InternalService(prisma, config()).listTenants({ page: 1, pageSize: 10 });

    expect(page.items[0]).toMatchObject({ id: TENANT, ownerEmail: "ze@x.com", billingStatus: "TRIALING", planName: null });
    const select = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0].select;
    const asText = JSON.stringify(select);
    for (const forbidden of ["stripe", "passwordHash", "passwordSetToken"]) expect(asText).not.toContain(forbidden);
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 10, pageCount: 1 });
  });

  it("busca por nome, slug ou e-mail do dono (só DONO), sem diferenciar caixa", async () => {
    const prisma = buildPrisma();

    await new InternalService(prisma, config()).listTenants({ search: "  ZÉ@X.com " });

    const where = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: "ZÉ@X.com", mode: "insensitive" } },
      { slug: { contains: "ZÉ@X.com", mode: "insensitive" } },
      { users: { some: { role: "OWNER", email: { contains: "zé@x.com" } } } },
    ]);
  });

  it("sem busca lista todos, paginado (skip/take no banco)", async () => {
    const prisma = buildPrisma();

    await new InternalService(prisma, config()).listTenants({ page: 3, pageSize: 20 });

    const args = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({});
    expect(args).toMatchObject({ skip: 40, take: 20 });
  });
});

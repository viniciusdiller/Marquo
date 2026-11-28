import { ConfigService } from "@nestjs/config";
import { Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { InternalService } from "../internal/internal.service";
import { PlatformAdminService, TEAM_PREVIEW_LIMIT } from "./platform-admin.service";

const owner = {
  id: "dono-1",
  name: "Brenno",
  email: "dono@x.com",
  role: Role.OWNER,
  isActive: true,
  createdAt: new Date("2026-11-03T18:18:00Z"),
  tenant: {
    id: "t-1",
    name: "Del Bianco",
    slug: "del-bianco",
    users: [{ id: "u-2", name: "Ana", email: "ana@x.com", role: Role.PROFESSIONAL, isActive: true, createdAt: new Date() }],
    _count: { users: 1 },
  },
};

function build(rows: unknown[] = [owner]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(rows.length);
  const prisma = { user: { findMany, count } } as unknown as PrismaService;
  const service = new PlatformAdminService(prisma, {} as InternalService, { get: jest.fn() } as unknown as ConfigService);
  return { service, findMany, count };
}

describe("PlatformAdminService.listUsers (por dono)", () => {
  it("lista só donos e devolve a equipe do negócio de cada um", async () => {
    const { service, findMany, count } = build();
    const page = await service.listUsers({});

    const args = findMany.mock.calls[0][0];
    expect(args.where.role).toBe(Role.OWNER);
    expect(count.mock.calls[0][0].where.role).toBe(Role.OWNER);
    // equipe = todo mundo do negócio que NÃO é dono, com teto
    expect(args.select.tenant.select.users.where).toEqual({ role: { not: Role.OWNER } });
    expect(args.select.tenant.select.users.take).toBe(TEAM_PREVIEW_LIMIT);

    expect(page.items[0]).toMatchObject({
      id: "dono-1",
      tenant: { id: "t-1", name: "Del Bianco", slug: "del-bianco" },
      team: [{ id: "u-2", name: "Ana" }],
      teamTotal: 1,
    });
    // o tenant da resposta não carrega a lista crua nem a contagem do Prisma
    expect(page.items[0].tenant).not.toHaveProperty("users");
  });

  it("busca acha o dono por ele, pelo negócio ou por alguém da equipe", async () => {
    const { service, findMany } = build();
    await service.listUsers({ search: "ana" });
    const [condition] = findMany.mock.calls[0][0].where.AND;
    expect(condition.OR).toHaveLength(3);
    expect(condition.OR[2]).toEqual({
      tenant: {
        users: {
          some: {
            role: { not: Role.OWNER },
            OR: [{ name: { contains: "ana", mode: "insensitive" } }, { email: { contains: "ana" } }],
          },
        },
      },
    });
  });

  it("filtro por papel da equipe: só donos com alguém daquele papel, e a equipe mostra só esse papel", async () => {
    const { service, findMany } = build();
    await service.listUsers({ role: Role.PROFESSIONAL });
    const args = findMany.mock.calls[0][0];
    expect(args.where.AND).toContainEqual({ tenant: { users: { some: { role: Role.PROFESSIONAL } } } });
    expect(args.select.tenant.select.users.where).toEqual({ role: Role.PROFESSIONAL });
  });

  it("filtro 'Dono' é o mesmo que sem filtro", async () => {
    const { service, findMany } = build();
    await service.listUsers({ role: Role.OWNER });
    expect(findMany.mock.calls[0][0].where.AND).toEqual([]);
  });
});

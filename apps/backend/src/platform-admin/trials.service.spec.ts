import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AUDIT_TRIAL_SET, trialDaysLeft, TRIAL_MAX_DAYS, TrialsService } from "./trials.service";

const DAY = 86_400_000;
const NOW = new Date("2026-10-26T12:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);
const TENANT_ID = "3f2b8f0e-0000-4000-8000-000000000001";

function row(over: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    name: "Salão da Ana",
    slug: "salao-da-ana",
    createdAt: inDays(-10),
    trialEndsAt: inDays(4),
    suspendedAt: null,
    users: [{ name: "Ana", email: "ana@salao.com", phone: "11912345678" }],
    ...over,
  };
}

function build(options: { tenant?: unknown; updateCount?: number; rows?: unknown[]; total?: number } = {}) {
  const tenant = "tenant" in options ? options.tenant : { trialEndsAt: inDays(4), subscription: null };
  const updateMany = jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 });
  const auditCreate = jest.fn().mockResolvedValue({});
  const tx = { tenant: { updateMany }, adminAuditLog: { create: auditCreate } };
  const findMany = jest.fn().mockResolvedValue(options.rows ?? [row()]);
  const prisma = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue(tenant),
      findMany,
      count: jest.fn().mockResolvedValue(options.total ?? (options.rows ?? [row()]).length),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row({ trialEndsAt: inDays(30) })),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  return { service: new TrialsService(prisma), prisma, updateMany, auditCreate, findMany };
}

describe("trialDaysLeft", () => {
  it("arredonda para cima (vence daqui a 3 horas = falta 1 dia) e fica negativo quando já venceu", () => {
    expect(trialDaysLeft(new Date(NOW.getTime() + 3 * 3_600_000), NOW)).toBe(1);
    expect(trialDaysLeft(inDays(14), NOW)).toBe(14);
    expect(trialDaysLeft(inDays(-5), NOW)).toBe(-5);
    expect(trialDaysLeft(NOW, NOW)).toBe(0);
  });
});

describe("TrialsService.setRemaining", () => {
  it("define a data final como hoje + N dias (calculada no servidor) e audita antes/depois", async () => {
    const { service, updateMany, auditCreate } = build();

    const result = await service.setRemaining(TENANT_ID, 30, "admin@marquo.com.br", NOW);

    expect(updateMany.mock.calls[0][0].data).toEqual({ trialEndsAt: inDays(30) });
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({ action: AUDIT_TRIAL_SET, actor: "admin@marquo.com.br", tenantId: TENANT_ID });
    expect(auditCreate.mock.calls[0][0].data.detail).toContain("30 dia(s)");
    expect(result).toMatchObject({ id: TENANT_ID, name: "Salão da Ana" });
  });

  it("vale para MENOS que o atual (encurtar) e 0 encerra agora", async () => {
    const shorter = build();
    await shorter.service.setRemaining(TENANT_ID, 1, "a@b.com", NOW);
    expect(shorter.updateMany.mock.calls[0][0].data.trialEndsAt).toEqual(inDays(1));

    const end = build();
    await end.service.setRemaining(TENANT_ID, 0, "a@b.com", NOW);
    expect(end.updateMany.mock.calls[0][0].data.trialEndsAt).toEqual(NOW);
  });

  it("reabre um teste já vencido (a base é HOJE, não a data vencida)", async () => {
    const { service, updateMany } = build({ tenant: { trialEndsAt: inDays(-40), subscription: null } });
    await service.setRemaining(TENANT_ID, 14, "a@b.com", NOW);
    expect(updateMany.mock.calls[0][0].data.trialEndsAt).toEqual(inDays(14));
  });

  it("limita a 0..365 dias, inteiros (valor fora disso é 400 e nada é escrito)", async () => {
    for (const days of [-1, TRIAL_MAX_DAYS + 1, 1.5, NaN, 99999]) {
      const { service, prisma, updateMany } = build();
      await expect(service.setRemaining(TENANT_ID, days, "a@b.com", NOW)).rejects.toThrow(BadRequestException);
      expect(updateMany).not.toHaveBeenCalled();
      expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
    }
    await expect(build().service.setRemaining(TENANT_ID, TRIAL_MAX_DAYS, "a@b.com", NOW)).resolves.toBeDefined();
  });

  it("negócio com assinatura: 409 (não há teste para definir) e nada é escrito", async () => {
    const { service, updateMany } = build({ tenant: { trialEndsAt: inDays(4), subscription: { id: "s-1" } } });
    await expect(service.setRemaining(TENANT_ID, 30, "a@b.com", NOW)).rejects.toThrow(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("negócio inexistente ou já excluído: o mesmo 404", async () => {
    const { service, prisma } = build({ tenant: null });
    await expect(service.setRemaining(TENANT_ID, 30, "a@b.com", NOW)).rejects.toThrow(NotFoundException);
    // Excluído é filtrado na leitura (deletedAt: null), igual a inexistente.
    expect((prisma.tenant.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({ id: TENANT_ID, deletedAt: null });
  });

  it("concorrência: a escrita confere o trialEndsAt lido e a ausência de assinatura; se mudou, 409 e SEM auditoria", async () => {
    const { service, updateMany, auditCreate } = build({ updateCount: 0 });
    await expect(service.setRemaining(TENANT_ID, 30, "a@b.com", NOW)).rejects.toThrow(ConflictException);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: TENANT_ID,
      deletedAt: null,
      trialEndsAt: inDays(4),
      subscription: { is: null },
    });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("o prazo nunca vem do cliente: o service só aceita um número de dias", async () => {
    const { service } = build();
    // @ts-expect-error: uma data não é um número de dias
    await expect(service.setRemaining(TENANT_ID, "2030-01-01", "a@b.com", NOW)).rejects.toThrow(BadRequestException);
  });
});

describe("TrialsService.list", () => {
  it("lista só negócios sem assinatura e não excluídos, do que vence primeiro", async () => {
    const { service, findMany } = build();
    await service.list({}, NOW);
    const args = findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual(expect.arrayContaining([{ deletedAt: null }, { subscription: { is: null } }]));
    expect(args.orderBy).toEqual({ trialEndsAt: "asc" });
  });

  it("filtra por em teste / vencido, e os vencidos vêm do mais recente", async () => {
    const active = build();
    await active.service.list({ status: "ACTIVE" }, NOW);
    expect(active.findMany.mock.calls[0][0].where.AND).toContainEqual({ trialEndsAt: { gt: NOW } });

    const expired = build();
    await expired.service.list({ status: "EXPIRED" }, NOW);
    expect(expired.findMany.mock.calls[0][0].where.AND).toContainEqual({ trialEndsAt: { lte: NOW } });
    expect(expired.findMany.mock.calls[0][0].orderBy).toEqual({ trialEndsAt: "desc" });
  });

  it("busca por nome, endereço ou e-mail do dono", async () => {
    const { service, findMany } = build();
    await service.list({ search: "  Ana " }, NOW);
    const or = findMany.mock.calls[0][0].where.AND.find((c: Record<string, unknown>) => "OR" in c).OR;
    expect(or).toHaveLength(3);
    expect(JSON.stringify(or)).toContain("ana");
  });

  it("devolve dias restantes, vencido, suspenso e o dono (sem hash nem token)", async () => {
    const { service } = build({
      rows: [row({ trialEndsAt: inDays(4) }), row({ id: "b", trialEndsAt: inDays(-3), suspendedAt: inDays(-1) })],
    });
    const page = await service.list({}, NOW);

    expect(page.items[0]).toMatchObject({ daysLeft: 4, expired: false, suspended: false, owner: { email: "ana@salao.com" } });
    expect(page.items[1]).toMatchObject({ daysLeft: -3, expired: true, suspended: true });
    expect(JSON.stringify(page)).not.toMatch(/passwordHash|token/i);
  });

  it("pagina e limita o tamanho da página", async () => {
    const { service, findMany } = build({ total: 60 });
    const page = await service.list({ page: 3, pageSize: 20 }, NOW);
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 40, take: 20 });
    expect(page).toMatchObject({ total: 60, page: 3, pageSize: 20, pageCount: 3 });
  });
});

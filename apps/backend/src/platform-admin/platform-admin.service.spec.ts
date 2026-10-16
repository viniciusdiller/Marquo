import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { InternalService } from "../internal/internal.service";
import { PlatformAdminService } from "./platform-admin.service";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ACTOR = "admin@marquo.com.br";

function build(over: { updateCount?: number; tenant?: unknown; existingSlugs?: string[]; professionals?: number } = {}) {
  const tx = {
    tenant: {
      updateMany: jest.fn().mockResolvedValue({ count: over.updateCount ?? 1 }),
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { slug: string } }) =>
          (over.existingSlugs ?? []).includes(where.slug) ? { id: "existente" } : null,
        ),
      create: jest.fn().mockImplementation(async ({ data }: { data: { name: string; slug: string } }) => ({
        id: "novo-tenant",
        name: data.name,
        slug: data.slug,
      })),
    },
    user: {
      create: jest.fn().mockResolvedValue({ id: "novo-dono" }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    subscription: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: over.updateCount ?? 1 }),
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const detail = {
    id: TENANT,
    name: "Salão",
    slug: "salao",
    createdAt: new Date(),
    trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
    suspendedAt: null,
    subscription: null,
    users: [],
    _count: { appointments: 0, clients: 0, professionals: 0, services: 0 },
    couponRedemptions: [],
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    tenant: {
      // `tenant: null` simula "não existe"; um objeto sobrescreve campos do detalhe padrão (a mesma linha
      // serve à leitura do extendTrial e ao getTenant devolvido no fim).
      findFirst: jest
        .fn()
        .mockResolvedValue(over.tenant === undefined ? detail : over.tenant === null ? null : { ...detail, ...(over.tenant as object) }),
      updateMany: tx.tenant.updateMany,
    },
    adminAuditLog: { findMany: jest.fn().mockResolvedValue([]), create: tx.adminAuditLog.create },
    plan: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { tier: string } }) => {
        const plans: Record<string, { id: string; tier: string; name: string; maxProfessionals: number | null }> = {
          ESSENCIAL: { id: "p-ess", tier: "ESSENCIAL", name: "Essencial", maxProfessionals: 2 },
          PREMIUM: { id: "p-prem", tier: "PREMIUM", name: "Premium", maxProfessionals: null },
        };
        return plans[where.tier] ?? null;
      }),
    },
    professional: { count: jest.fn().mockResolvedValue(over.professionals ?? 1) },
  } as unknown as PrismaService;
  const internal = { createPasswordResetLink: jest.fn().mockResolvedValue({ link: "x" }) } as unknown as InternalService;
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") } as unknown as ConfigService;
  return { service: new PlatformAdminService(prisma, internal, config), prisma, tx, internal };
}

describe("PlatformAdminService.suspend", () => {
  it("suspende e grava auditoria com ator e motivo na mesma transação", async () => {
    const { service, tx } = build();
    await service.suspend(TENANT, { reason: "Uso abusivo" }, ACTOR);

    expect(tx.tenant.updateMany).toHaveBeenCalledWith({
      where: { id: TENANT, suspendedAt: null },
      data: { suspendedAt: expect.any(Date), suspendedReason: "Uso abusivo" },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: { action: "TENANT_SUSPENDED", actor: ACTOR, tenantId: TENANT, detail: "Uso abusivo" },
    });
  });

  it("já suspenso: 409 e nenhuma auditoria duplicada", async () => {
    const { service, tx } = build({ updateCount: 0 });
    await expect(service.suspend(TENANT, { reason: "Outra vez" }, ACTOR)).rejects.toThrow(ConflictException);
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("negócio inexistente: 404 (não 409)", async () => {
    const { service } = build({ updateCount: 0, tenant: null });
    await expect(service.suspend(TENANT, { reason: "Teste" }, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

describe("PlatformAdminService.reactivate", () => {
  it("reativa só quem está suspenso e audita", async () => {
    const { service, tx } = build();
    await service.reactivate(TENANT, ACTOR);
    expect(tx.tenant.updateMany).toHaveBeenCalledWith({
      where: { id: TENANT, suspendedAt: { not: null } },
      data: { suspendedAt: null, suspendedReason: null },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: { action: "TENANT_REACTIVATED", actor: ACTOR, tenantId: TENANT },
    });
  });

  it("não suspenso: 409", async () => {
    const { service } = build({ updateCount: 0 });
    await expect(service.reactivate(TENANT, ACTOR)).rejects.toThrow(ConflictException);
  });
});

describe("PlatformAdminService.extendTrial", () => {
  it("soma os dias ao fim atual do trial e audita", async () => {
    const trialEndsAt = new Date(Date.now() + 5 * 86_400_000);
    const { service, tx } = build({ tenant: { trialEndsAt, subscription: null } });

    await service.extendTrial(TENANT, { days: 14 }, ACTOR);

    const data = tx.tenant.updateMany.mock.calls[0][0].data as { trialEndsAt: Date };
    expect(data.trialEndsAt.getTime()).toBe(trialEndsAt.getTime() + 14 * 86_400_000);
    // `trialEndsAt` e "sem assinatura" no WHERE: escrita só vale se nada mudou desde a leitura.
    expect(tx.tenant.updateMany.mock.calls[0][0].where).toEqual({
      id: TENANT,
      trialEndsAt,
      subscription: { is: null },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalled();
  });

  it("trial já vencido soma a partir de HOJE, não do dia que passou", async () => {
    const trialEndsAt = new Date(Date.now() - 30 * 86_400_000);
    const { service, tx } = build({ tenant: { trialEndsAt, subscription: null } });

    const before = Date.now();
    await service.extendTrial(TENANT, { days: 7 }, ACTOR);

    const next = (tx.tenant.updateMany.mock.calls[0][0].data as { trialEndsAt: Date }).trialEndsAt.getTime();
    expect(next).toBeGreaterThanOrEqual(before + 7 * 86_400_000);
    expect(next).toBeLessThan(before + 8 * 86_400_000);
  });

  it("recusa quando já há assinatura (não existe trial para estender)", async () => {
    const { service, tx } = build({
      tenant: { trialEndsAt: new Date(), subscription: { id: "sub-1" } },
    });
    await expect(service.extendTrial(TENANT, { days: 7 }, ACTOR)).rejects.toThrow(ConflictException);
    expect(tx.tenant.updateMany).not.toHaveBeenCalled();
  });

  it("recusa passar do teto de 180 dias à frente (service repete o limite do DTO)", async () => {
    const { service } = build({
      tenant: { trialEndsAt: new Date(Date.now() + 170 * 86_400_000), subscription: null },
    });
    await expect(service.extendTrial(TENANT, { days: 30 }, ACTOR)).rejects.toThrow(BadRequestException);
  });

  it("alguém mudou o trial no meio: 409 e sem auditoria", async () => {
    const { service, tx } = build({
      tenant: { trialEndsAt: new Date(Date.now() + 86_400_000), subscription: null },
      updateCount: 0,
    });
    await expect(service.extendTrial(TENANT, { days: 7 }, ACTOR)).rejects.toThrow(ConflictException);
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("negócio inexistente: 404", async () => {
    const { service } = build({ tenant: null });
    await expect(service.extendTrial(TENANT, { days: 7 }, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

describe("PlatformAdminService.createPasswordResetLink", () => {
  it("delega ao fluxo existente com o e-mail do admin como ator", async () => {
    const { service, internal } = build();
    await service.createPasswordResetLink(TENANT, ACTOR);
    expect(internal.createPasswordResetLink).toHaveBeenCalledWith(TENANT, ACTOR);
  });
});

describe("PlatformAdminService.createTenant", () => {
  const DTO = {
    businessName: "Barbearia do Zé",
    ownerName: "Zé Silva",
    ownerEmail: "ze@barbearia.com",
    ownerPhone: "(11) 91234-5678",
  };

  it("cria negócio + dono OWNER + auditoria e devolve o link para o dono definir a senha", async () => {
    const { service, tx } = build();
    const result = await service.createTenant(DTO, ACTOR);

    expect(result.tenant).toEqual({ id: "novo-tenant", name: "Barbearia do Zé", slug: "barbearia-do-ze" });
    expect(result.link).toMatch(/^http:\/\/localhost:3000\/definir-senha\?token=[0-9a-f]{64}$/);

    const owner = tx.user.create.mock.calls[0][0].data;
    expect(owner).toMatchObject({
      tenantId: "novo-tenant",
      email: "ze@barbearia.com",
      role: "OWNER",
      phone: "11912345678", // normalizado: só dígitos, sem DDI
    });
    // O token em claro NUNCA vai ao banco: só o sha256 dele.
    const token = new URL(result.link).searchParams.get("token") as string;
    expect(owner.passwordSetTokenHash).toBe(hashPasswordSetToken(token));
    expect(JSON.stringify(tx.user.create.mock.calls)).not.toContain(token);
    expect(owner.passwordSetTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    // Trilha na mesma transação, sem token nem link.
    const audit = tx.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: "TENANT_CREATED", actor: ACTOR, tenantId: "novo-tenant" });
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  // O admin não conhece nem escolhe a senha do dono: ela nasce aleatória e inutilizável.
  it("grava um hash de senha aleatório (nunca algo derivado do e-mail/nome) ", async () => {
    const { service, tx } = build();
    await service.createTenant(DTO, ACTOR);
    const hash = tx.user.create.mock.calls[0][0].data.passwordHash as string;
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("trial padrão de 14 dias e sem assinatura", async () => {
    const { service, tx } = build();
    await service.createTenant(DTO, ACTOR);
    const data = tx.tenant.create.mock.calls[0][0].data as { trialEndsAt: Date };
    const days = (data.trialEndsAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it("slug reservado ganha sufixo (o nome 'Dashboard' não ocupa /dashboard)", async () => {
    const { service } = build();
    const result = await service.createTenant({ ...DTO, businessName: "Dashboard" }, ACTOR);
    expect(result.tenant.slug).toBe("dashboard-2");
  });

  it("slug já usado por outro negócio ganha sufixo", async () => {
    const { service } = build({ existingSlugs: ["barbearia-do-ze"] });
    const result = await service.createTenant(DTO, ACTOR);
    expect(result.tenant.slug).toBe("barbearia-do-ze-2");
  });

  it("e-mail já cadastrado: 409 (decidido pelo banco) e nada de link", async () => {
    const { service, tx } = build();
    tx.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["email"] } }),
    );
    await expect(service.createTenant(DTO, ACTOR)).rejects.toThrow(ConflictException);
  });
});

describe("PlatformAdminService.grantCourtesy", () => {
  const TENANT_SEM_ASSINATURA = { subscription: null };

  it("libera o plano sem cobrar, com data de fim, e audita (na mesma transação)", async () => {
    const { service, tx } = build({ tenant: TENANT_SEM_ASSINATURA });
    await service.grantCourtesy(TENANT, { tier: "PREMIUM" as never, days: 30 }, ACTOR);

    const call = tx.subscription.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: TENANT });
    expect(call.create).toMatchObject({ tenantId: TENANT, planId: "p-prem", status: "ACTIVE", courtesy: true });
    const days = (call.update.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(tx.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "COURTESY_GRANTED",
      actor: ACTOR,
      tenantId: TENANT,
    });
  });

  it("sem `days`: sem data de fim", async () => {
    const { service, tx } = build({ tenant: TENANT_SEM_ASSINATURA });
    await service.grantCourtesy(TENANT, { tier: "PREMIUM" as never }, ACTOR);
    expect(tx.subscription.upsert.mock.calls[0][0].update.currentPeriodEnd).toBeNull();
  });

  it("pode trocar o plano de uma cortesia que já existe", async () => {
    const { service, tx } = build({ tenant: { subscription: { courtesy: true } } });
    await service.grantCourtesy(TENANT, { tier: "PREMIUM" as never }, ACTOR);
    expect(tx.subscription.upsert).toHaveBeenCalled();
  });

  // Quando houver provedor de pagamento, a assinatura paga nunca pode ser sobrescrita por uma cortesia.
  it("recusa (409) quando já existe assinatura PAGA", async () => {
    const { service, tx } = build({ tenant: { subscription: { courtesy: false } } });
    await expect(service.grantCourtesy(TENANT, { tier: "PREMIUM" as never }, ACTOR)).rejects.toThrow(ConflictException);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("recusa plano com menos vagas do que a equipe ativa (nada é desativado em silêncio)", async () => {
    const { service, tx } = build({ tenant: TENANT_SEM_ASSINATURA, professionals: 3 });
    await expect(service.grantCourtesy(TENANT, { tier: "ESSENCIAL" as never }, ACTOR)).rejects.toThrow(
      /3 profissionais ativos/,
    );
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it("negócio inexistente: 404", async () => {
    const { service } = build({ tenant: null });
    await expect(service.grantCourtesy(TENANT, { tier: "PREMIUM" as never }, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

describe("PlatformAdminService.removeCourtesy", () => {
  it("remove só cortesia (courtesy: true no WHERE) e audita", async () => {
    const { service, tx } = build();
    await service.removeCourtesy(TENANT, ACTOR);
    expect(tx.subscription.deleteMany).toHaveBeenCalledWith({ where: { tenantId: TENANT, courtesy: true } });
    expect(tx.adminAuditLog.create.mock.calls[0][0].data.action).toBe("COURTESY_REMOVED");
  });

  it("sem cortesia: 409 (e uma assinatura paga NUNCA é apagada por aqui)", async () => {
    const { service, tx } = build({ updateCount: 0 });
    await expect(service.removeCourtesy(TENANT, ACTOR)).rejects.toThrow(ConflictException);
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("PlatformAdminService.updateOwnerPhone", () => {
  it("normaliza o número e atualiza só o dono ativo do negócio", async () => {
    const { service, tx } = build();
    await service.updateOwnerPhone(TENANT, { phone: "+55 (21) 98888-7777" }, ACTOR);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, role: "OWNER", isActive: true },
      data: { phone: "21988887777" },
    });
  });

  // O número é dado pessoal: a trilha registra o fato, nunca o valor.
  it("a auditoria não guarda o telefone", async () => {
    const { service, tx } = build();
    await service.updateOwnerPhone(TENANT, { phone: "21988887777" }, ACTOR);
    expect(JSON.stringify(tx.adminAuditLog.create.mock.calls)).not.toContain("988887777");
  });

  it("sem dono ativo: 404", async () => {
    const { service, tx } = build();
    tx.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.updateOwnerPhone(TENANT, { phone: "21988887777" }, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

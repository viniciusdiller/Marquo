import { BadGatewayException, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoClient } from "../billing/payments/mercadopago.client";
import {
  AUDIT_TENANT_DELETION_SCHEDULED,
  AUDIT_TENANT_PURGED,
  DELETION_RETENTION_DAYS,
  evaluateDeletion,
  PURGE_STEPS,
  TenantDeletionService,
} from "./tenant-deletion.service";

const rmMock = jest.fn().mockResolvedValue(undefined);
jest.mock("fs/promises", () => ({ rm: (...args: unknown[]) => rmMock(...args) }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-22T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const TENANT_ID = "3f2b8f0e-0000-4000-8000-000000000001";

type Sub = Parameters<typeof evaluateDeletion>[1];
const sub = (over: Record<string, unknown> = {}): Sub =>
  ({ status: "ACTIVE", courtesy: false, method: "CARD_RECURRING", cancelAtPeriodEnd: false, currentPeriodEnd: null, updatedAt: ago(1), ...over }) as Sub;
const tenant = (over: Record<string, unknown> = {}) => ({ trialEndsAt: ago(200), suspendedAt: null, deletedAt: null, ...over });

describe("evaluateDeletion", () => {
  it("em teste (TRIALING), assinatura ativa, em atraso dentro da tolerância: NUNCA excluível", () => {
    expect(evaluateDeletion(tenant({ trialEndsAt: new Date(NOW.getTime() + DAY) }), null, NOW).deletable).toBe(false);
    expect(evaluateDeletion(tenant(), sub({ status: "ACTIVE", currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY) }), NOW).deletable).toBe(false);
    expect(evaluateDeletion(tenant(), sub({ status: "PAST_DUE", currentPeriodEnd: ago(1) }), NOW).deletable).toBe(false);
  });

  it("teste vencido sem assinatura: o prazo conta do fim do teste", () => {
    const r = evaluateDeletion(tenant({ trialEndsAt: ago(100) }), null, NOW);
    expect(r).toMatchObject({ billingStatus: "TRIAL_EXPIRED", deletable: true, eligible: true });
    expect(r.accessEndedAt).toEqual(ago(100));
  });

  it("prazo de 90 dias: 89 dias ainda não é elegível, 90 é", () => {
    expect(evaluateDeletion(tenant({ trialEndsAt: ago(89) }), null, NOW)).toMatchObject({ deletable: true, eligible: false });
    expect(evaluateDeletion(tenant({ trialEndsAt: ago(DELETION_RETENTION_DAYS) }), null, NOW)).toMatchObject({ eligible: true });
  });

  it("informa quando o prazo termina (eligibleOn = fim do acesso + 90 dias)", () => {
    const r = evaluateDeletion(tenant({ trialEndsAt: ago(10) }), null, NOW);
    expect(r.eligibleOn).toEqual(new Date(ago(10).getTime() + DELETION_RETENTION_DAYS * DAY));
  });

  it("assinatura cancelada: conta do fim do período pago", () => {
    const r = evaluateDeletion(tenant(), sub({ status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: ago(95) }), NOW);
    expect(r).toMatchObject({ billingStatus: "CANCELED", deletable: true, eligible: true });
    expect(r.accessEndedAt).toEqual(ago(95));
  });

  it("cortesia vencida e Pix sem novo mês: conta do fim do período", () => {
    expect(evaluateDeletion(tenant(), sub({ courtesy: true, method: null, currentPeriodEnd: ago(120) }), NOW)).toMatchObject({
      billingStatus: "EXPIRED",
      deletable: true,
      eligible: true,
    });
    expect(evaluateDeletion(tenant(), sub({ method: "PIX_MONTHLY", currentPeriodEnd: ago(30) }), NOW)).toMatchObject({
      billingStatus: "PERIOD_ENDED",
      eligible: false,
    });
  });

  it("inadimplente (UNPAID): conta do fim do período MAIS a tolerância", () => {
    const r = evaluateDeletion(tenant(), sub({ status: "PAST_DUE", currentPeriodEnd: ago(100) }), NOW);
    expect(r.billingStatus).toBe("UNPAID");
    expect(r.accessEndedAt!.getTime()).toBeGreaterThan(ago(100).getTime());
  });

  it("suspenso pela plataforma: conta da suspensão", () => {
    const r = evaluateDeletion(tenant({ suspendedAt: ago(40) }), null, NOW);
    expect(r).toMatchObject({ billingStatus: "SUSPENDED", deletable: true, eligible: false });
    expect(r.accessEndedAt).toEqual(ago(40));
  });

  it("negócio já excluído não é excluível de novo", () => {
    expect(evaluateDeletion(tenant({ deletedAt: ago(1) }), null, NOW).deletable).toBe(false);
  });
});

// Transação falsa que REGISTRA a ordem das escritas e recusa qualquer tabela não esperada (ex.: Subscription).
function build(options: { tenantRow?: unknown; failAt?: string; mp?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const wheres: Record<string, unknown> = {};
  const allowed = new Set(PURGE_STEPS.map((s) => s.model.charAt(0).toLowerCase() + s.model.slice(1)));
  const delegate = (name: string) => ({
    deleteMany: jest.fn(async ({ where }: { where: unknown }) => {
      calls.push(name);
      wheres[name] = where;
      if (options.failAt === name) throw new Error("falha simulada");
      return { count: 1 };
    }),
  });
  const adminAuditLog = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      calls.push("adminAuditLog");
      return data;
    }),
  };
  const tenantDelegate = {
    update: jest.fn(async () => {
      calls.push("tenant.update");
      return {};
    }),
    updateMany: jest.fn(async () => {
      calls.push("tenant.updateMany");
      return { count: 1 };
    }),
  };
  const tx = new Proxy({} as Record<string, unknown>, {
    get: (_target, key: string) => {
      if (key === "adminAuditLog") return adminAuditLog;
      if (key === "tenant") return tenantDelegate;
      if (!allowed.has(key)) throw new Error(`tabela inesperada na exclusão: ${key}`);
      return delegate(key);
    },
  });

  const tenantRow =
    "tenantRow" in options
      ? options.tenantRow
      : {
          id: TENANT_ID,
          name: "Salão",
          slug: "salao-teste",
          createdAt: ago(300),
          trialEndsAt: ago(200),
          suspendedAt: null,
          deletedAt: null,
          subscription: null,
        };
  const count = jest.fn().mockResolvedValue(3);
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenantRow), findMany: jest.fn().mockResolvedValue([]), update: tenantDelegate.update },
    user: { count },
    professional: { count },
    client: { count },
    appointment: { count },
    ticket: { count },
    product: { count },
    financialEntry: { count },
    review: { count },
    intakeResponse: { count },
    tenantGalleryImage: { count },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  const mp = {
    isConfigured: jest.fn().mockReturnValue(true),
    cancelPreapproval: jest.fn().mockResolvedValue({ status: "cancelled" }),
    getPreapproval: jest.fn().mockResolvedValue({ status: "authorized" }),
    ...options.mp,
  };
  return { service: new TenantDeletionService(prisma, mp as unknown as MercadoPagoClient), mp, prisma, calls, wheres, adminAuditLog, tenantDelegate, count };
}

describe("TenantDeletionService.purge", () => {
  beforeEach(() => rmMock.mockClear());

  it("exclusão dentro do prazo: audita, apaga na ordem, anonimiza o negócio e remove os arquivos", async () => {
    const { service, calls, adminAuditLog, tenantDelegate } = build();

    await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "admin@marquo.com.br", NOW)).resolves.toEqual({
      purged: true,
      slug: "salao-teste",
    });

    // Auditoria primeiro, na MESMA transação, depois todos os passos, e por último o esqueleto do negócio.
    expect(calls[0]).toBe("adminAuditLog");
    expect(calls.at(-1)).toBe("tenant.update");
    expect(calls).toHaveLength(PURGE_STEPS.length + 2);
    expect(adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: AUDIT_TENANT_PURGED,
      actor: "admin@marquo.com.br",
      tenantId: TENANT_ID,
    });
    const data = (tenantDelegate.update.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> };
    expect(data.data).toMatchObject({
      name: "Negócio excluído",
      slug: `excluido-${TENANT_ID}`,
      address: null,
      logoUrl: null,
      whatsappNumber: null,
      listedInMarketplace: false,
      deletedAt: NOW,
    });
    expect(rmMock).toHaveBeenCalledTimes(1);
    expect(String(rmMock.mock.calls[0][0])).toContain(`tenants/${TENANT_ID}`);
  });

  it("toda escrita é filtrada pelo tenantId (nunca apaga dado de outro negócio)", async () => {
    const { service, wheres } = build();
    await service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW);
    expect(Object.keys(wheres)).toHaveLength(PURGE_STEPS.length);
    for (const where of Object.values(wheres)) expect(where).toEqual({ tenantId: TENANT_ID });
  });

  it("respeita a ordem das chaves RESTRICT na execução", async () => {
    const { service, calls } = build();
    await service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW);
    const before = (a: string, b: string) => expect(calls.indexOf(a)).toBeLessThan(calls.indexOf(b));
    before("commissionPayout", "financialEntry");
    before("commissionPayout", "professional");
    before("stockMovement", "product");
    before("appointment", "service");
    before("appointment", "professional");
    before("ticket", "user");
  });

  it("confirmação digitada diferente do endereço: 400 e NADA é escrito", async () => {
    const { service, prisma, calls } = build();
    await expect(service.purge(TENANT_ID, { confirmSlug: "outro-salao" }, "a@b.com", NOW)).rejects.toThrow(BadRequestException);
    await expect(service.purge(TENANT_ID, { confirmSlug: "" }, "a@b.com", NOW)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(rmMock).not.toHaveBeenCalled();
  });

  describe("negócio que ainda tem acesso (ex.: conta de teste)", () => {
    const active = (subscription: unknown = null, over: Record<string, unknown> = {}) => ({
      id: TENANT_ID,
      name: "S",
      slug: "salao-teste",
      createdAt: ago(5),
      trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
      suspendedAt: null,
      deletedAt: null,
      subscription,
      ...over,
    });

    it("em teste: exclui com a confirmação certa e audita o motivo, quando informado", async () => {
      const { service, adminAuditLog, calls } = build({ tenantRow: active() });
      await expect(
        service.purge(TENANT_ID, { confirmSlug: "salao-teste", reason: "conta de teste do time" }, "a@b.com", NOW),
      ).resolves.toEqual({ purged: true, slug: "salao-teste" });
      expect(calls[0]).toBe("adminAuditLog");
      const detail = (adminAuditLog.create.mock.calls[0][0] as { data: { detail: string } }).data.detail;
      expect(detail).toContain("ainda com acesso");
      expect(detail).toContain("conta de teste do time");
    });

    it("sem motivo também exclui (motivo é opcional)", async () => {
      const { service } = build({ tenantRow: active() });
      await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toMatchObject({ purged: true });
    });

    it("confirmação digitada errada continua barrando", async () => {
      const { service, prisma } = build({ tenantRow: active() });
      await expect(
        service.purge(TENANT_ID, { confirmSlug: "outro", reason: "conta de teste do time" }, "a@b.com", NOW),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    const cardSub = (over: Record<string, unknown> = {}) =>
      sub({ status: "ACTIVE", currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY), providerSubscriptionId: "pre-123", ...over });

    it("com assinatura PAGA no cartão: cancela a recorrência no provedor ANTES de apagar e audita", async () => {
      const { service, mp, calls, adminAuditLog } = build({ tenantRow: active(cardSub()) });
      mp.cancelPreapproval.mockImplementation(async () => {
        calls.push("mp.cancel");
        return { status: "cancelled" };
      });

      await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toMatchObject({ purged: true });

      expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre-123");
      expect(calls[0]).toBe("mp.cancel");
      expect(calls[1]).toBe("adminAuditLog");
      expect((adminAuditLog.create.mock.calls[0][0] as { data: { detail: string } }).data.detail).toContain("recorrência do cartão cancelada");
    });

    it("falha ao cancelar no provedor: 502 e NADA é apagado (senão o cartão seguiria sendo cobrado)", async () => {
      const { service, prisma, calls } = build({
        tenantRow: active(cardSub()),
        mp: { cancelPreapproval: jest.fn().mockRejectedValue(new Error("mp fora do ar")), getPreapproval: jest.fn().mockResolvedValue({ status: "authorized" }) },
      });
      await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).rejects.toThrow(BadGatewayException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });

    it("recorrência já cancelada no provedor (exclusão repetida): segue e apaga", async () => {
      const { service } = build({
        tenantRow: active(cardSub()),
        mp: { cancelPreapproval: jest.fn().mockRejectedValue(new Error("já cancelada")), getPreapproval: jest.fn().mockResolvedValue({ status: "cancelled" }) },
      });
      await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toMatchObject({ purged: true });
    });

    it("cartão, mas o Mercado Pago não está configurado neste servidor: 503 e nada é apagado", async () => {
      const { service, prisma } = build({ tenantRow: active(cardSub()), mp: { isConfigured: jest.fn().mockReturnValue(false) } });
      await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("Pix (sem recorrência no provedor) ou sem assinatura: exclui sem falar com o Mercado Pago", async () => {
      const pix = build({ tenantRow: active(sub({ method: "PIX_MONTHLY", currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY) })) });
      await expect(pix.service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toMatchObject({ purged: true });
      expect(pix.mp.cancelPreapproval).not.toHaveBeenCalled();
      const trial = build({ tenantRow: active() });
      await trial.service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW);
      expect(trial.mp.cancelPreapproval).not.toHaveBeenCalled();
    });

    it("cortesia não é assinatura paga: pode excluir (com motivo)", async () => {
      const { service } = build({
        tenantRow: active(sub({ courtesy: true, method: null, currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY) })),
      });
      await expect(
        service.purge(TENANT_ID, { confirmSlug: "salao-teste", reason: "cortesia encerrada a pedido" }, "a@b.com", NOW),
      ).resolves.toMatchObject({ purged: true });
    });

    it("simulação (preview): sempre pode excluir; avisa quando vai cancelar a recorrência do cartão", async () => {
      const paid = build({ tenantRow: active(cardSub()) });
      await expect(paid.service.preview(TENANT_ID, NOW)).resolves.toMatchObject({
        purgeable: true,
        hasAccess: true,
        blockedReason: null,
        cancelsCardSubscription: true,
      });
      const trial = build({ tenantRow: active() });
      await expect(trial.service.preview(TENANT_ID, NOW)).resolves.toMatchObject({ purgeable: true, cancelsCardSubscription: false });
    });
  });

  it("negócio já excluído: 409 com mensagem própria", async () => {
    const { service } = build({
      tenantRow: { id: TENANT_ID, name: "Negócio excluído", slug: `excluido-${TENANT_ID}`, createdAt: ago(5), trialEndsAt: ago(200), suspendedAt: null, deletedAt: ago(1), subscription: null },
    });
    await expect(service.purge(TENANT_ID, { confirmSlug: `excluido-${TENANT_ID}` }, "a@b.com", NOW)).rejects.toThrow(/já foram excluídos/);
  });

  it("negócio inexistente: o mesmo 404 de qualquer recurso", async () => {
    const { service } = build({ tenantRow: null });
    await expect(service.purge(TENANT_ID, { confirmSlug: "x" }, "a@b.com", NOW)).rejects.toThrow(NotFoundException);
  });

  describe("antes dos 90 dias (exclusão antecipada)", () => {
    const early = {
      id: TENANT_ID,
      name: "S",
      slug: "salao-teste",
      createdAt: ago(100),
      trialEndsAt: ago(30),
      suspendedAt: null,
      deletedAt: null,
      subscription: null,
    };

    it("exclui NA HORA, sem esperar os 90 dias e sem motivo (só a confirmação digitada)", async () => {
      const { service, adminAuditLog, calls } = build({ tenantRow: early });
      await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toMatchObject({ purged: true });
      expect(calls[0]).toBe("adminAuditLog");
      const detail = (adminAuditLog.create.mock.calls[0][0] as { data: { detail: string } }).data.detail;
      expect(detail).toContain("slug=salao-teste");
      expect(detail).not.toContain("motivo");
    });

    it("motivo é opcional: se vier, vai para a auditoria; curto demais ou longo demais é 400", async () => {
      const { service, adminAuditLog, prisma } = build({ tenantRow: early });
      for (const reason of ["curto", "x".repeat(301)]) {
        await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste", reason }, "a@b.com", NOW)).rejects.toThrow(BadRequestException);
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();

      await service.purge(TENANT_ID, { confirmSlug: "salao-teste", reason: "Pedido do titular por e-mail" }, "a@b.com", NOW);
      expect(adminAuditLog.create.mock.calls[0][0].data.detail).toContain("motivo: Pedido do titular por e-mail");
    });
  });

  it("falha em qualquer passo: a transação é desfeita, o negócio NÃO é anonimizado e os arquivos ficam", async () => {
    const { service, tenantDelegate } = build({ failAt: "client" });
    await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).rejects.toThrow("falha simulada");
    expect(tenantDelegate.update).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
  });

  it("falha ao remover a pasta de arquivos não desfaz a exclusão (o banco já está limpo)", async () => {
    rmMock.mockRejectedValueOnce(new Error("EACCES"));
    const { service } = build();
    await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toMatchObject({ purged: true });
  });

  it("nunca toca em assinatura, cobranças nem cupons (o proxy da transação falharia)", async () => {
    const { service } = build();
    await expect(service.purge(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).resolves.toBeDefined();
  });
});

describe("TenantDeletionService.preview", () => {
  it("conta o que existe, sempre filtrando pelo negócio, sem alterar nada", async () => {
    const { service, count, calls } = build();
    const result = await service.preview(TENANT_ID, NOW);

    expect(result).toMatchObject({ slug: "salao-teste", deletable: true, eligible: true, retentionDays: 90 });
    expect(result.counts).toEqual({
      users: 3,
      professionals: 3,
      clients: 3,
      appointments: 3,
      tickets: 3,
      products: 3,
      financialEntries: 3,
      reviews: 3,
      intakeResponses: 3,
      galleryImages: 3,
    });
    for (const call of count.mock.calls) expect(call[0]).toEqual({ where: { tenantId: TENANT_ID } });
    expect(calls).toEqual([]);
  });

  it("negócio inexistente: 404", async () => {
    await expect(build({ tenantRow: null }).service.preview(TENANT_ID)).rejects.toThrow(NotFoundException);
  });
});

describe("TenantDeletionService.listCandidates", () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: `Negócio ${id}`,
    slug: id,
    createdAt: ago(300),
    trialEndsAt: ago(200),
    suspendedAt: null,
    subscription: null,
    ...over,
  });

  it("lista só quem já perdeu o acesso, do mais antigo para o mais novo, e nunca quem ainda usa o sistema", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      row("novo", { trialEndsAt: ago(10) }),
      row("antigo", { trialEndsAt: ago(150) }),
      row("em-teste", { trialEndsAt: new Date(NOW.getTime() + 5 * DAY) }),
    ]);

    const page = await service.listCandidates({}, NOW);

    expect(page.items.map((i) => i.slug)).toEqual(["antigo", "novo"]);
    expect(page.items[0]).toMatchObject({ eligible: true, billingStatus: "TRIAL_EXPIRED" });
    expect(page.items[1]).toMatchObject({ eligible: false });
    expect(page.total).toBe(2);
  });

  it("ignora negócios já excluídos (filtro no banco) e limita a leitura", async () => {
    const { service, prisma } = build();
    await service.listCandidates({}, NOW);
    const args = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({ deletedAt: null });
    expect(args.take).toBeLessThanOrEqual(2000);
  });

  it("pagina", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue(Array.from({ length: 25 }, (_, i) => row(`n${i}`, { trialEndsAt: ago(100 + i) })));
    const page = await service.listCandidates({ page: 2, pageSize: 10 }, NOW);
    expect(page.items).toHaveLength(10);
    expect(page).toMatchObject({ total: 25, page: 2, pageSize: 10, pageCount: 3 });
  });
});

describe("TenantDeletionService.scheduleDeletion (Aguardar 90 dias)", () => {
  beforeEach(() => rmMock.mockClear());

  const row = (over: Record<string, unknown> = {}) => ({
    id: TENANT_ID,
    name: "S",
    slug: "salao-teste",
    createdAt: ago(5),
    trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
    suspendedAt: null,
    deletedAt: null,
    subscription: null,
    ...over,
  });

  it("negócio com acesso: suspende agora, audita e NÃO apaga nada; eligível em 90 dias", async () => {
    const { service, calls, tenantDelegate, adminAuditLog } = build({ tenantRow: row() });

    const result = await service.scheduleDeletion(TENANT_ID, { confirmSlug: "salao-teste", reason: "pedido do titular" }, "a@b.com", NOW);

    expect(result).toEqual({ scheduled: true, slug: "salao-teste", eligibleOn: new Date(NOW.getTime() + DELETION_RETENTION_DAYS * DAY) });
    expect(tenantDelegate.updateMany).toHaveBeenCalledWith({
      where: { id: TENANT_ID, deletedAt: null, suspendedAt: null },
      data: { suspendedAt: NOW, suspendedReason: "Exclusão agendada: aguardando 90 dias" },
    });
    expect(calls).toEqual(["tenant.updateMany", "adminAuditLog"]);
    expect(tenantDelegate.update).not.toHaveBeenCalled();
    expect(adminAuditLog.create.mock.calls[0][0].data).toMatchObject({ action: AUDIT_TENANT_DELETION_SCHEDULED, actor: "a@b.com", tenantId: TENANT_ID });
    expect(rmMock).not.toHaveBeenCalled();
  });

  it("já sem acesso (teste vencido): não suspende de novo e a contagem segue do fim do acesso", async () => {
    const { service, tenantDelegate } = build({ tenantRow: row({ trialEndsAt: ago(30) }) });
    const result = await service.scheduleDeletion(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW);
    expect(tenantDelegate.updateMany).not.toHaveBeenCalled();
    expect(result.eligibleOn).toEqual(new Date(ago(30).getTime() + DELETION_RETENTION_DAYS * DAY));
  });

  it("cartão recorrente: cancela no provedor antes; se falhar, nada é suspenso", async () => {
    const card = sub({ status: "ACTIVE", currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY), providerSubscriptionId: "pre-1" });
    const ok = build({ tenantRow: row({ subscription: card }) });
    await ok.service.scheduleDeletion(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW);
    expect(ok.mp.cancelPreapproval).toHaveBeenCalledWith("pre-1");

    const fail = build({
      tenantRow: row({ subscription: card }),
      mp: { cancelPreapproval: jest.fn().mockRejectedValue(new Error("fora")), getPreapproval: jest.fn().mockResolvedValue({ status: "authorized" }) },
    });
    await expect(fail.service.scheduleDeletion(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).rejects.toThrow(BadGatewayException);
    expect(fail.tenantDelegate.updateMany).not.toHaveBeenCalled();
  });

  it("confirmação errada: 400; já excluído: 409; inexistente: 404; motivo curto: 400 — e nada é escrito", async () => {
    const wrong = build({ tenantRow: row() });
    await expect(wrong.service.scheduleDeletion(TENANT_ID, { confirmSlug: "outro" }, "a@b.com", NOW)).rejects.toThrow(BadRequestException);
    await expect(wrong.service.scheduleDeletion(TENANT_ID, { confirmSlug: "salao-teste", reason: "curto" }, "a@b.com", NOW)).rejects.toThrow(BadRequestException);
    expect(wrong.prisma.$transaction).not.toHaveBeenCalled();

    const gone = build({ tenantRow: row({ deletedAt: ago(1) }) });
    await expect(gone.service.scheduleDeletion(TENANT_ID, { confirmSlug: "salao-teste" }, "a@b.com", NOW)).rejects.toThrow(ConflictException);

    const missing = build({ tenantRow: null });
    await expect(missing.service.scheduleDeletion(TENANT_ID, { confirmSlug: "x" }, "a@b.com", NOW)).rejects.toThrow(NotFoundException);
  });
});

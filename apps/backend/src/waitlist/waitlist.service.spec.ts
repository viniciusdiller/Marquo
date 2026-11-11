import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { WaitlistService } from "./waitlist.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConsumerAuthService } from "../consumer-auth/consumer-auth.service";

function buildPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: "tenant-1" }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "tenant-1",
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        subscription: null,
      }),
    },
    service: {
      findFirst: jest.fn().mockResolvedValue({ id: "svc-1" }),
    },
    professional: {
      findFirst: jest.fn().mockResolvedValue({ id: "prof-1" }),
    },
    waitlistEntry: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "w-1", ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    ...overrides,
  } as Record<string, unknown>;
  // A criação roda numa transação (lock por cliente): o tx enxerga os MESMOS modelos do mock.
  prisma.$transaction = jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as unknown as PrismaService;
}

function buildConsumerAuth() {
  return {
    ensureLink: jest
      .fn()
      .mockResolvedValue({ id: "client-1", name: "Cliente Teste", phone: "11999998888" }),
  } as unknown as ConsumerAuthService;
}

const consumer = { consumerId: "consumer-1", sessionId: "session-1" };

const baseDto = {
  serviceId: "svc-1",
};

describe("WaitlistService.createFromPublicLink", () => {
  it("cria a entrada quando serviço (e profissional, se informado) pertencem ao tenant", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());

    const result = await service.createFromPublicLink(
      "slug",
      { ...baseDto, professionalId: "prof-1" },
      consumer,
    );

    expect(prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "svc-1", tenantId: "tenant-1" }) }),
    );
    expect(prisma.professional.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "prof-1", tenantId: "tenant-1" }) }),
    );
    expect(result.tenantId).toBe("tenant-1");
  });

  // Regressão: serviceId/professionalId do link público entravam direto no create sem
  // nenhuma checagem — um cliente podia apontar pra um serviço/profissional de outro tenant,
  // e esse nome vazaria no findAllByTenant (include de service/professional) do tenant errado.
  it("rejeita serviceId que não pertence ao tenant do slug", async () => {
    const prisma = buildPrisma({ service: { findFirst: jest.fn().mockResolvedValue(null) } });
    const service = new WaitlistService(prisma, buildConsumerAuth());

    await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(BadRequestException);
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("rejeita professionalId que não pertence ao tenant do slug", async () => {
    const prisma = buildPrisma({ professional: { findFirst: jest.fn().mockResolvedValue(null) } });
    const service = new WaitlistService(prisma, buildConsumerAuth());

    await expect(
      service.createFromPublicLink("slug", { ...baseDto, professionalId: "prof-de-outro-tenant" }, consumer),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("lança NotFoundException se o tenant não existe", async () => {
    const prisma = buildPrisma({ tenant: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new WaitlistService(prisma, buildConsumerAuth());

    await expect(service.createFromPublicLink("slug-invalido", baseDto, consumer)).rejects.toThrow(
      NotFoundException,
    );
  });

  // Mesma regressão de AppointmentsService.createFromPublicLink: rota @Public() não passa
  // pelo TenantBillingGuard, então trial vencido não impedia novas entradas na lista de espera.
  it("lança ForbiddenException quando o tenant não tem acesso de billing (trial vencido)", async () => {
    const prisma = buildPrisma({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: "tenant-1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "tenant-1",
          trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          subscription: null,
        }),
      },
    });
    const service = new WaitlistService(prisma, buildConsumerAuth());

    await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(ForbiddenException);
  });

  // Identidade vem da sessão do Consumer, nunca do body (mesma regra do agendamento).
  it("grava nome/telefone do Client derivado de ensureLink", async () => {
    const prisma = buildPrisma();
    const consumerAuth = buildConsumerAuth();
    const service = new WaitlistService(prisma, consumerAuth);

    const result = await service.createFromPublicLink("slug", baseDto, consumer);

    expect(consumerAuth.ensureLink).toHaveBeenCalledWith(prisma, "consumer-1", "tenant-1");
    expect(result).toMatchObject({ clientName: "Cliente Teste", clientPhone: "11999998888", clientId: "client-1" });
  });
});

describe("WaitlistService.createFromPublicLink: sem duplicar a mesma pessoa", () => {
  const dto = { serviceId: "svc-1", professionalId: "prof-1", preferredDate: "2026-11-14" };

  it("se a pessoa JÁ está na lista (aguardando ou contatada) para o mesmo serviço, profissional e dia, devolve a existente", async () => {
    const prisma = buildPrisma();
    (prisma.waitlistEntry.findFirst as jest.Mock).mockResolvedValue({ id: "w-antiga", status: "PENDING" });
    const service = new WaitlistService(prisma, buildConsumerAuth());

    const result = await service.createFromPublicLink("slug", dto, consumer);

    expect(result).toMatchObject({ id: "w-antiga", alreadyWaiting: true });
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("a busca é do cliente DAQUELE negócio, do mesmo serviço/profissional/dia e só de solicitações ativas", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await service.createFromPublicLink("slug", dto, consumer);

    const where = (prisma.waitlistEntry.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "tenant-1", clientId: "client-1", serviceId: "svc-1", professionalId: "prof-1" });
    expect(where.preferredDate).toEqual(new Date("2026-11-14"));
    expect(where.status).toEqual({ in: ["PENDING", "CONTACTED"] });
  });

  it("sem profissional e sem dia, compara com 'qualquer profissional' e 'sem dia' (null)", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await service.createFromPublicLink("slug", { serviceId: "svc-1" }, consumer);
    const where = (prisma.waitlistEntry.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.professionalId).toBeNull();
    expect(where.preferredDate).toBeNull();
  });

  it("cria normalmente quando não há solicitação ativa (e uma encerrada não conta: pode entrar de novo)", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    const result = await service.createFromPublicLink("slug", dto, consumer);
    expect(prisma.waitlistEntry.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ alreadyWaiting: false, clientId: "client-1" });
  });

  it("serializa por cliente (lock) para dois cliques seguidos não gerarem duas linhas", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await service.createFromPublicLink("slug", dto, consumer);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});

describe("WaitlistService.findAllByTenant", () => {
  const row = {
    id: "w-1",
    clientId: "c-1",
    clientName: "Carla",
    clientPhone: "11999998888",
    preferredDate: new Date("2026-11-14T00:00:00.000Z"),
    notes: "de manhã",
    status: "PENDING",
    createdAt: new Date("2026-11-10T15:00:00.000Z"),
    service: { name: "Corte" },
    professional: { user: { name: "Alex" } },
  };

  it("devolve só o que a tela mostra: serviço, profissional, dia, observação e quando entrou", async () => {
    const prisma = buildPrisma();
    (prisma.waitlistEntry.findMany as jest.Mock).mockResolvedValue([row, { ...row, id: "w-2", professional: null, preferredDate: null, notes: null }]);
    const service = new WaitlistService(prisma, buildConsumerAuth());

    const [first, second] = await service.findAllByTenant("tenant-1");

    expect(first).toEqual({
      id: "w-1",
      clientId: "c-1",
      clientName: "Carla",
      clientPhone: "11999998888",
      serviceName: "Corte",
      professionalName: "Alex",
      preferredDate: "2026-11-14",
      notes: "de manhã",
      status: "PENDING",
      createdAt: "2026-11-10T15:00:00.000Z",
    });
    expect(second).toMatchObject({ professionalName: null, preferredDate: null, notes: null });
  });

  it("filtra sempre pelo negócio e ordena do mais antigo (quem espera há mais tempo primeiro)", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await service.findAllByTenant("tenant-1", "PENDING");
    const call = (prisma.waitlistEntry.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: "tenant-1", status: "PENDING" });
    expect(call.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(call.take).toBe(500);
  });

  it("'CLOSED' junta resolvidos e cancelados; sem filtro lista todos", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await service.findAllByTenant("tenant-1", "CLOSED");
    expect((prisma.waitlistEntry.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ tenantId: "tenant-1", status: { in: ["RESOLVED", "CANCELED"] } });
    await service.findAllByTenant("tenant-1");
    expect((prisma.waitlistEntry.findMany as jest.Mock).mock.calls[1][0].where).toEqual({ tenantId: "tenant-1" });
  });

  it("a seleção não inclui nenhum campo interno do profissional (só o nome)", async () => {
    const prisma = buildPrisma();
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await service.findAllByTenant("tenant-1");
    const select = (prisma.waitlistEntry.findMany as jest.Mock).mock.calls[0][0].select;
    expect(select.professional).toEqual({ select: { user: { select: { name: true } } } });
    expect(JSON.stringify(select)).not.toMatch(/email|passwordHash|photoUrl|bio/);
  });
});

describe("WaitlistService.counts", () => {
  it("conta por aba: aguardando, contatados e encerrados (resolvidos + cancelados)", async () => {
    const prisma = buildPrisma();
    (prisma.waitlistEntry.groupBy as jest.Mock).mockResolvedValue([
      { status: "PENDING", _count: { _all: 3 } },
      { status: "CONTACTED", _count: { _all: 2 } },
      { status: "RESOLVED", _count: { _all: 4 } },
      { status: "CANCELED", _count: { _all: 1 } },
    ]);
    const service = new WaitlistService(prisma, buildConsumerAuth());
    expect(await service.counts("tenant-1")).toEqual({ pending: 3, contacted: 2, closed: 5 });
    expect((prisma.waitlistEntry.groupBy as jest.Mock).mock.calls[0][0].where).toEqual({ tenantId: "tenant-1" });
  });

  it("sem registros, tudo zero", async () => {
    const service = new WaitlistService(buildPrisma(), buildConsumerAuth());
    expect(await service.counts("tenant-1")).toEqual({ pending: 0, contacted: 0, closed: 0 });
  });
});

describe("WaitlistService.updateStatus: só transições permitidas", () => {
  function setup(current: string) {
    const prisma = buildPrisma();
    (prisma.waitlistEntry.findFirst as jest.Mock).mockResolvedValue({ status: current });
    (prisma.waitlistEntry.findFirstOrThrow as jest.Mock).mockResolvedValue({ id: "w-1" });
    return { prisma, service: new WaitlistService(prisma, buildConsumerAuth()) };
  }

  it.each([
    ["PENDING", "CONTACTED"],
    ["PENDING", "RESOLVED"],
    ["PENDING", "CANCELED"],
    ["CONTACTED", "PENDING"],
    ["CONTACTED", "RESOLVED"],
    ["CONTACTED", "CANCELED"],
  ])("%s → %s é permitido", async (from, to) => {
    const { service, prisma } = setup(from);
    await service.updateStatus("tenant-1", "w-1", to as never);
    expect(prisma.waitlistEntry.updateMany).toHaveBeenCalledWith({ where: { id: "w-1", tenantId: "tenant-1", status: from }, data: { status: to } });
  });

  // Antes qualquer mudança passava, inclusive ressuscitar uma solicitação já resolvida ou cancelada.
  it.each([
    ["RESOLVED", "PENDING"],
    ["RESOLVED", "CONTACTED"],
    ["RESOLVED", "CANCELED"],
    ["CANCELED", "PENDING"],
    ["CANCELED", "CONTACTED"],
    ["CANCELED", "RESOLVED"],
  ])("%s → %s é recusado (encerrada é final) e nada é escrito", async (from, to) => {
    const { service, prisma } = setup(from);
    await expect(service.updateStatus("tenant-1", "w-1", to as never)).rejects.toThrow(ConflictException);
    expect(prisma.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("repetir o mesmo status não escreve nada (idempotente)", async () => {
    const { service, prisma } = setup("CONTACTED");
    await service.updateStatus("tenant-1", "w-1", "CONTACTED" as never);
    expect(prisma.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("a escrita leva o status de ORIGEM no WHERE: se outra pessoa mudou antes, dá 409 em vez de sobrescrever", async () => {
    const { service, prisma } = setup("PENDING");
    (prisma.waitlistEntry.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(service.updateStatus("tenant-1", "w-1", "CONTACTED" as never)).rejects.toThrow(/outra pessoa/);
  });

  it("registro de outro negócio (ou inexistente) é 404 e a busca leva o tenantId", async () => {
    const prisma = buildPrisma();
    (prisma.waitlistEntry.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new WaitlistService(prisma, buildConsumerAuth());
    await expect(service.updateStatus("tenant-1", "de-outro", "CONTACTED" as never)).rejects.toThrow(NotFoundException);
    expect((prisma.waitlistEntry.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({ id: "de-outro", tenantId: "tenant-1" });
  });
});

import { ConflictException, NotFoundException } from "@nestjs/common";
import { AppointmentStatus } from "@marquo/database";
import { ProfessionalsService } from "./professionals.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlanLimitService } from "../billing/plan-limit.service";

function buildPlanLimitServiceMock() {
  return {
    assertCanAddProfessional: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlanLimitService;
}

function professionalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "prof-1",
    tenantId: "tenant-1",
    userId: "user-1",
    bio: null,
    isActive: true,
    user: { id: "user-1", name: "Alex", email: "alex@example.com" },
    workingHours: [],
    ...overrides,
  };
}

function buildPrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
  const tx = {
    user: { update: jest.fn().mockResolvedValue({ id: "user-1" }) },
    professional: {
      update: jest.fn().mockImplementation(({ data }) => ({ ...professionalRecord(), ...data })),
    },
  };
  const prisma = {
    professional: {
      findFirst: jest.fn().mockResolvedValue(professionalRecord()),
    },
    appointment: {
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    ...overrides,
  } as unknown as PrismaService;
  return { prisma, tx };
}

describe("ProfessionalsService.update", () => {
  // Regressão: desativar um profissional não checava agendamentos futuros — o
  // agendamento continuava ocupando o horário (SLOT_BLOCKING_STATUSES) mas sumia da
  // coluna do calendário (getCalendar filtra professionals por isActive), ficando
  // invisível pro dono/recepção.
  it("recusa desativar um profissional com agendamento futuro pendente", async () => {
    const { prisma } = buildPrismaMock({
      appointment: { count: jest.fn().mockResolvedValue(1) },
    });
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await expect(service.update("tenant-1", "prof-1", { isActive: false })).rejects.toThrow(
      ConflictException,
    );
  });

  it("permite desativar quando não há agendamento futuro pendente", async () => {
    const { prisma } = buildPrismaMock();
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    const result = await service.update("tenant-1", "prof-1", { isActive: false });

    expect(result.isActive).toBe(false);
    expect(prisma.appointment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          professionalId: "prof-1",
          status: {
            in: expect.arrayContaining([
              AppointmentStatus.SCHEDULED,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.IN_SERVICE,
            ]),
          },
        }),
      }),
    );
  });

  it("não checa agendamento futuro ao só editar bio (isActive inalterado)", async () => {
    const { prisma } = buildPrismaMock();
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await service.update("tenant-1", "prof-1", { bio: "Nova bio" });

    expect(prisma.appointment.count).not.toHaveBeenCalled();
  });

  it("atualiza nome e e-mail do usuário vinculado", async () => {
    const { prisma, tx } = buildPrismaMock();
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await service.update("tenant-1", "prof-1", { name: "Novo Nome", email: "novo@example.com" });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Novo Nome", email: "novo@example.com" },
    });
  });

  it("lança ConflictException se o novo e-mail já pertence a outro usuário", async () => {
    const { prisma } = buildPrismaMock({
      user: { findUnique: jest.fn().mockResolvedValue({ id: "outro-user" }) },
    });
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await expect(
      service.update("tenant-1", "prof-1", { email: "ocupado@example.com" }),
    ).rejects.toThrow(ConflictException);
  });
});

describe("ProfessionalsService.remove", () => {
  function buildRemovePrisma(overrides: { counts?: Partial<Record<string, number>>; isOwner?: boolean; professional?: unknown } = {}) {
    const counts = { appointment: 0, commissionEntry: 0, ticket: 0, cashRegister: 0, financialEntry: 0, ...overrides.counts };
    const prisma = {
      professional: {
        findFirst: jest
          .fn()
          .mockResolvedValue("professional" in overrides ? overrides.professional : professionalRecord()),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(overrides.isOwner ? { id: "user-1" } : null),
        delete: jest.fn().mockResolvedValue({ id: "user-1" }),
      },
      appointment: { count: jest.fn().mockResolvedValue(counts.appointment) },
      commissionEntry: { count: jest.fn().mockResolvedValue(counts.commissionEntry) },
      ticket: { count: jest.fn().mockResolvedValue(counts.ticket) },
      cashRegister: { count: jest.fn().mockResolvedValue(counts.cashRegister) },
      financialEntry: { count: jest.fn().mockResolvedValue(counts.financialEntry) },
    } as unknown as PrismaService;
    return prisma;
  }

  const service = (prisma: PrismaService) => new ProfessionalsService(prisma, buildPlanLimitServiceMock());

  it("exclui o usuário de quem não tem nenhum histórico", async () => {
    const prisma = buildRemovePrisma();

    await service(prisma).remove("tenant-1", "prof-1");

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  // Regressão: o schema protege o histórico de propósito (onDelete: Restrict). Cada tipo de
  // histórico, sozinho, precisa impedir a exclusão — senão o dono apagaria o profissional e
  // quebraria relatórios de comissão e o caixa.
  it.each([
    ["agendamentos", { appointment: 1 }],
    ["comissões", { commissionEntry: 1 }],
    ["comandas abertas por ele", { ticket: 1 }],
    ["caixas abertos por ele", { cashRegister: 1 }],
    ["lançamentos financeiros criados por ele", { financialEntry: 1 }],
  ])("recusa excluir quem tem %s e manda desativar", async (_label, counts) => {
    const prisma = buildRemovePrisma({ counts });

    const attempt = service(prisma).remove("tenant-1", "prof-1");

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(/Desative-o/);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  // Regressão: o papel do dono não vinha no include de findOneOrThrow, então checar
  // `professional.user.role` dava sempre undefined e o dono podia se apagar (perdendo o acesso).
  it("nunca exclui o dono da conta, mesmo sem histórico", async () => {
    const prisma = buildRemovePrisma({ isOwner: true });

    await expect(service(prisma).remove("tenant-1", "prof-1")).rejects.toThrow(
      "O dono da conta não pode ser excluído.",
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("a checagem do dono filtra por tenant e papel no WHERE", async () => {
    const prisma = buildRemovePrisma();

    await service(prisma).remove("tenant-1", "prof-1");

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-1", tenantId: "tenant-1", role: "OWNER" },
      select: { id: true },
    });
  });

  it("profissional de outro tenant (ou inexistente) dá 404 e não apaga nada", async () => {
    const prisma = buildRemovePrisma({ professional: null });

    await expect(service(prisma).remove("tenant-1", "prof-de-outro")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.professional.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prof-de-outro", tenantId: "tenant-1" } }),
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});

describe("ProfessionalsService.create — serviços desde o cadastro", () => {
  const SERVICE_A = "11111111-1111-4111-8111-111111111111";
  const SERVICE_B = "22222222-2222-4222-8222-222222222222";
  const baseDto = { name: "Alex", email: "alex@example.com", initialPassword: "senha-forte-123" };

  function buildCreateMocks(ownedServiceIds: string[]) {
    const tx = {
      service: { findMany: jest.fn().mockResolvedValue(ownedServiceIds.map((id) => ({ id }))) },
      user: { create: jest.fn().mockResolvedValue({ id: "user-1" }) },
      professional: {
        create: jest.fn().mockResolvedValue({ id: "prof-1", user: { id: "user-1", name: "Alex", email: "alex@example.com" } }),
      },
      professionalService: { createMany: jest.fn().mockResolvedValue({ count: ownedServiceIds.length }) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    return { prisma, tx };
  }

  it("vincula os serviços escolhidos ao profissional recém-criado, na mesma transação", async () => {
    const { prisma, tx } = buildCreateMocks([SERVICE_A, SERVICE_B]);
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await service.create("tenant-1", { ...baseDto, serviceIds: [SERVICE_A, SERVICE_B] });

    expect(tx.professionalService.createMany).toHaveBeenCalledWith({
      data: [
        { professionalId: "prof-1", serviceId: SERVICE_A },
        { professionalId: "prof-1", serviceId: SERVICE_B },
      ],
    });
  });

  it("confere os serviços no negócio (tenantId no WHERE)", async () => {
    const { prisma, tx } = buildCreateMocks([SERVICE_A]);
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await service.create("tenant-1", { ...baseDto, serviceIds: [SERVICE_A] });

    expect(tx.service.findMany).toHaveBeenCalledWith({
      where: { id: { in: [SERVICE_A] }, tenantId: "tenant-1" },
      select: { id: true },
    });
  });

  // Segurança (IDOR): id de serviço de OUTRO negócio não pode ser vinculado, e não pode sobrar usuário/profissional criado.
  it("recusa serviço de outro negócio (ou inexistente) com 404 e não cria nada", async () => {
    const { prisma, tx } = buildCreateMocks([SERVICE_A]); // só A é deste tenant; B não
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await expect(service.create("tenant-1", { ...baseDto, serviceIds: [SERVICE_A, SERVICE_B] })).rejects.toThrow(NotFoundException);

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.professional.create).not.toHaveBeenCalled();
    expect(tx.professionalService.createMany).not.toHaveBeenCalled();
  });

  it("ids repetidos viram um vínculo só (o service não depende do DTO)", async () => {
    const { prisma, tx } = buildCreateMocks([SERVICE_A]);
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await service.create("tenant-1", { ...baseDto, serviceIds: [SERVICE_A, SERVICE_A] });

    expect(tx.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [SERVICE_A] }, tenantId: "tenant-1" } }));
    expect(tx.professionalService.createMany).toHaveBeenCalledWith({ data: [{ professionalId: "prof-1", serviceId: SERVICE_A }] });
  });

  it("sem serviços: cria o profissional como antes, sem consultar nem vincular serviço", async () => {
    const { prisma, tx } = buildCreateMocks([]);
    const service = new ProfessionalsService(prisma, buildPlanLimitServiceMock());

    await service.create("tenant-1", baseDto);
    await service.create("tenant-1", { ...baseDto, serviceIds: [] });

    expect(tx.professional.create).toHaveBeenCalledTimes(2);
    expect(tx.service.findMany).not.toHaveBeenCalled();
    expect(tx.professionalService.createMany).not.toHaveBeenCalled();
  });
});

describe("ProfessionalsService.createForOwner — o dono também atende", () => {
  const SERVICE_A = "11111111-1111-4111-8111-111111111111";
  const SERVICE_B = "22222222-2222-4222-8222-222222222222";

  function buildSelfMocks(opts: { owner?: unknown; ownedServiceIds?: string[] } = {}) {
    const owner = "owner" in opts ? opts.owner : { id: "owner-1", professional: null };
    const tx = {
      service: { findMany: jest.fn().mockResolvedValue((opts.ownedServiceIds ?? []).map((id) => ({ id }))) },
      professional: {
        create: jest.fn().mockResolvedValue({ id: "prof-9", userId: "owner-1", user: { id: "owner-1", name: "Dono", email: "dono@x.com" } }),
      },
      professionalService: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(owner) },
      $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const planLimit = buildPlanLimitServiceMock();
    return { prisma, tx, planLimit, service: new ProfessionalsService(prisma, planLimit) };
  }

  it("cria o profissional ligado à conta do dono (userId do token) e vincula os serviços", async () => {
    const { service, tx } = buildSelfMocks({ ownedServiceIds: [SERVICE_A, SERVICE_B] });

    await service.createForOwner("tenant-1", "owner-1", { bio: "Barbeiro e dono", serviceIds: [SERVICE_A, SERVICE_B] });

    expect(tx.professional.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tenantId: "tenant-1", userId: "owner-1", bio: "Barbeiro e dono" } }),
    );
    expect(tx.professionalService.createMany).toHaveBeenCalledWith({
      data: [
        { professionalId: "prof-9", serviceId: SERVICE_A },
        { professionalId: "prof-9", serviceId: SERVICE_B },
      ],
    });
  });

  // Segurança: só o OWNER ativo DESTE negócio (tenantId e papel no WHERE), nunca por um id vindo do corpo.
  it("busca a conta com tenantId, papel de dono e ativa no WHERE", async () => {
    const { service, prisma } = buildSelfMocks();
    await service.createForOwner("tenant-1", "owner-1", {});
    expect((prisma.user.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
      id: "owner-1",
      tenantId: "tenant-1",
      role: "OWNER",
      isActive: true,
    });
  });

  it("conta que não é de dono deste negócio (ou inativa) dá 404 e não cria nada", async () => {
    const { service, tx } = buildSelfMocks({ owner: null });
    await expect(service.createForOwner("tenant-1", "outro", {})).rejects.toThrow(NotFoundException);
    expect(tx.professional.create).not.toHaveBeenCalled();
  });

  it("dono que já é profissional recebe 409 (não duplica)", async () => {
    const { service, tx } = buildSelfMocks({ owner: { id: "owner-1", professional: { id: "prof-1" } } });
    await expect(service.createForOwner("tenant-1", "owner-1", {})).rejects.toThrow(ConflictException);
    expect(tx.professional.create).not.toHaveBeenCalled();
  });

  it("respeita o limite de profissionais do plano (o dono conta como um)", async () => {
    const { service, planLimit, tx } = buildSelfMocks();
    (planLimit.assertCanAddProfessional as jest.Mock).mockRejectedValue(new ConflictException("Limite atingido"));
    await expect(service.createForOwner("tenant-1", "owner-1", {})).rejects.toThrow(ConflictException);
    expect(planLimit.assertCanAddProfessional).toHaveBeenCalledWith("tenant-1");
    expect(tx.professional.create).not.toHaveBeenCalled();
  });

  it("serviço de outro negócio dá 404 e não cria o profissional", async () => {
    const { service, tx } = buildSelfMocks({ ownedServiceIds: [SERVICE_A] });
    await expect(service.createForOwner("tenant-1", "owner-1", { serviceIds: [SERVICE_A, SERVICE_B] })).rejects.toThrow(NotFoundException);
    expect(tx.professional.create).not.toHaveBeenCalled();
    expect(tx.professionalService.createMany).not.toHaveBeenCalled();
  });
});

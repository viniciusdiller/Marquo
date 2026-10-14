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

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Role } from "@marquo/database";
import { AppointmentsService } from "./appointments.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClientsService } from "../clients/clients.service";
import { ConsumerAuthService } from "../consumer-auth/consumer-auth.service";
import { AuthenticatedUser } from "../auth/types/auth-user";
import { AppointmentNotifierService } from "../email/appointment-notifier.service";

const FUTURE_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function buildClientsServiceMock() {
  return {
    upsertForBooking: jest.fn().mockResolvedValue({ id: "client-1" }),
  } as unknown as ClientsService;
}

// Identidade de quem agenda: vem da sessão do Consumer via ensureLink, nunca do body.
function buildConsumerAuthMock() {
  return {
    ensureLink: jest
      .fn()
      .mockResolvedValue({ id: "client-1", name: "Cliente Teste", phone: "11999998888" }),
  } as unknown as ConsumerAuthService;
}

const consumer = { consumerId: "consumer-1", sessionId: "session-1" };

function buildNotifierMock() {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as AppointmentNotifierService;
}

// Um atendimento "hidratado" como o APPOINTMENT_INCLUDE devolve — usado pelo serialize().
function hydratedAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    tenantId: "tenant-1",
    professionalId: "prof-1",
    clientName: "Cliente Teste",
    clientPhone: "11999998888",
    clientId: "client-1",
    startAt: new Date(FUTURE_DATE),
    endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    status: AppointmentStatus.CONFIRMED,
    source: "PUBLIC",
    notes: null,
    canceledAt: null,
    noShowAt: null,
    rescheduledCount: 0,
    items: [
      {
        id: "item-1",
        serviceId: "svc-1",
        position: 0,
        durationMinutes: 60,
        priceCentsSnapshot: 8000,
        service: { id: "svc-1", name: "Corte" },
      },
    ],
    professional: { user: { name: "Alex" } },
    tenant: { slug: "slug", name: "Salão Teste" },
    ...overrides,
  };
}

function buildTxMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    appointment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(hydratedAppointment()),
      update: jest.fn().mockImplementation(({ data }) => hydratedAppointment(data)),
    },
    timeBlock: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function buildPrismaMock(tx: ReturnType<typeof buildTxMock>) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: "tenant-1" }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "tenant-1",
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        subscription: null,
      }),
    },
    professional: {
      findFirst: jest.fn().mockResolvedValue({ id: "prof-1" }),
      findMany: jest.fn().mockResolvedValue([
        { id: "prof-1", slotGranularityMinutes: 15, user: { name: "Alex" }, workingHours: [] },
      ]),
    },
    timeBlock: { findMany: jest.fn().mockResolvedValue([]) },
    client: { findFirst: jest.fn().mockResolvedValue({ id: "client-1", name: "Cliente Teste", phone: "11999998888" }) },
    consumerTenantLink: { findMany: jest.fn().mockResolvedValue([{ clientId: "client-1" }]) },
    professionalService: {
      findFirst: jest.fn().mockResolvedValue({
        durationMinutes: null,
        priceCents: null,
        isActive: true,
        professional: { id: "prof-1", tenantId: "tenant-1", isActive: true },
        service: { id: "svc-1", tenantId: "tenant-1", isActive: true, durationMinutes: 60, priceCents: 8000 },
      }),
    },
    appointment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockImplementation(({ data }) => hydratedAppointment(data)),
    },
    $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
}

const owner: AuthenticatedUser = { userId: "u-1", tenantId: "tenant-1", role: Role.OWNER };

describe("AppointmentsService", () => {
  const clientsService = buildClientsServiceMock();
  const consumerAuth = buildConsumerAuthMock();
  const notifier = buildNotifierMock();

  const baseDto = {
    professionalId: "prof-1",
    serviceId: "svc-1",
    startAt: FUTURE_DATE,
  };

  describe("createFromPublicLink", () => {
    it("cria um atendimento CONFIRMED com 1 item quando não há conflito", async () => {
      const tx = buildTxMock();
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);

      const result = await service.createFromPublicLink("slug", baseDto, consumer);

      expect(tx.appointment.create).toHaveBeenCalledTimes(1);
      expect(result.priceCentsSnapshot).toBe(8000);
      expect(result.items).toHaveLength(1);
    });

    it("lança ConflictException quando há atendimento sobreposto que ocupa a agenda", async () => {
      const tx = buildTxMock({
        appointment: {
          findFirst: jest.fn().mockResolvedValue({ id: "existing" }),
          create: jest.fn(),
        },
      });
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);

      await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(ConflictException);
      expect(tx.appointment.create).not.toHaveBeenCalled();
    });

    it("lança ConflictException quando colide com um TimeBlock", async () => {
      const tx = buildTxMock({ timeBlock: { findFirst: jest.fn().mockResolvedValue({ id: "block-1" }) } });
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);

      await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(ConflictException);
    });

    it("lança BadRequestException ao agendar no passado", async () => {
      const service = new AppointmentsService(buildPrismaMock(buildTxMock()), clientsService, consumerAuth, notifier);

      await expect(
        service.createFromPublicLink("slug", { ...baseDto, startAt: "2020-01-01T10:00:00-03:00" }, consumer),
      ).rejects.toThrow(BadRequestException);
    });

    it("lança NotFoundException quando o serviço não está disponível para o profissional", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.professionalService.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(NotFoundException);
    });

    // Regressão: resolveServiceForProfessional já usou findUnique(professionalId_serviceId) +
    // checagem de tenantId em JS depois de buscar — janela de IDOR (busca o registro de
    // outro tenant antes de rejeitar). O filtro de tenantId tem que estar dentro do WHERE.
    it("busca o vínculo profissional↔serviço já filtrando pelo tenantId do link público", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.createFromPublicLink("slug", baseDto, consumer);

      expect(prisma.professionalService.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            professionalId: "prof-1",
            serviceId: "svc-1",
            service: expect.objectContaining({ tenantId: "tenant-1" }),
            professional: expect.objectContaining({ tenantId: "tenant-1" }),
          }),
        }),
      );
    });

    // Regressão: TenantBillingGuard não cobre rotas @Public(), então o link público de
    // agendamento continuava aceitando marcações mesmo com o trial vencido/assinatura
    // cancelada — só o dashboard ficava bloqueado.
    it("lança ForbiddenException quando o tenant não tem acesso de billing (trial vencido)", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: "tenant-1",
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        subscription: null,
      });
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("createByStaff", () => {
    it("cria atendimento SCHEDULED por padrão com cadastro rápido de cliente", async () => {
      const tx = buildTxMock();
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);

      await service.createByStaff(owner, {
        professionalId: "prof-1",
        startAt: FUTURE_DATE,
        items: [{ serviceId: "svc-1" }],
        clientName: "Novo Cliente",
        clientPhone: "11988887777",
      });

      const data = (tx.appointment.create as jest.Mock).mock.calls[0][0].data;
      expect(data.status).toBe(AppointmentStatus.SCHEDULED);
      expect(data.source).toBe("STAFF");
    });

    it("recusa PROFESSIONAL criando para a agenda de outro profissional", async () => {
      const service = new AppointmentsService(buildPrismaMock(buildTxMock()), clientsService, consumerAuth, notifier);
      const pro: AuthenticatedUser = {
        userId: "u-2",
        tenantId: "tenant-1",
        role: Role.PROFESSIONAL,
        professionalId: "prof-2",
      };

      await expect(
        service.createByStaff(pro, {
          professionalId: "prof-1",
          startAt: FUTURE_DATE,
          items: [{ serviceId: "svc-1" }],
          clientId: "client-1",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("exige cliente existente ou nome+telefone", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(
        service.createByStaff(owner, {
          professionalId: "prof-1",
          startAt: FUTURE_DATE,
          items: [{ serviceId: "svc-1" }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // Regressão: walk-in criado pela recepção usava a mesma checagem estrita do fluxo
    // público (startAt > Date.now()). Um datetime-local só tem granularidade de minuto,
    // então escolher "agora" para um cliente no balcão quase sempre caía no passado depois
    // do round-trip da requisição — precisa de uma tolerância que o fluxo público não tem.
    it("aceita um horário poucos segundos no passado (walk-in escolhendo 'agora')", async () => {
      const tx = buildTxMock();
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);
      const almostNow = new Date(Date.now() - 30_000).toISOString();

      await expect(
        service.createByStaff(owner, {
          professionalId: "prof-1",
          startAt: almostNow,
          items: [{ serviceId: "svc-1" }],
          clientName: "Novo Cliente",
          clientPhone: "11988887777",
        }),
      ).resolves.toBeDefined();
    });

    it("ainda recusa um horário claramente no passado", async () => {
      const service = new AppointmentsService(buildPrismaMock(buildTxMock()), clientsService, consumerAuth, notifier);

      await expect(
        service.createByStaff(owner, {
          professionalId: "prof-1",
          startAt: "2020-01-01T10:00:00-03:00",
          items: [{ serviceId: "svc-1" }],
          clientName: "Novo Cliente",
          clientPhone: "11988887777",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("cancelForConsumer", () => {
    it("cancela um atendimento CONFIRMED", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      const result = await service.cancelForConsumer("appt-1", consumer);

      expect(result.status).toBe(AppointmentStatus.CANCELED);
    });

    it("lança BadRequestException se já estiver cancelado", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(
        hydratedAppointment({ status: AppointmentStatus.CANCELED }),
      );
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.cancelForConsumer("appt-1", consumer)).rejects.toThrow(BadRequestException);
    });

    it("lança NotFoundException se o atendimento não existe (ou é de outro cliente)", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.cancelForConsumer("nao-existe", consumer)).rejects.toThrow(NotFoundException);
    });

    // Regressão: applyCancel só bloqueava CANCELED/COMPLETED, então um cliente logado
    // conseguia cancelar um atendimento IN_SERVICE (profissional atendendo agora)
    // ou já marcado NO_SHOW — diferente de applyReschedule, que já restringia a
    // SCHEDULED/CONFIRMED. A recepção (cancelByStaff) continua podendo cancelar em
    // qualquer estado não-terminal, só a ação iniciada pelo cliente ficou restrita.
    it.each([AppointmentStatus.IN_SERVICE, AppointmentStatus.NO_SHOW])(
      "lança BadRequestException ao tentar cancelar um atendimento %s pela conta do cliente",
      async (status) => {
        const prisma = buildPrismaMock(buildTxMock());
        (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment({ status }));
        const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

        await expect(service.cancelForConsumer("appt-1", consumer)).rejects.toThrow(BadRequestException);
      },
    );
  });

  describe("rescheduleForConsumer", () => {
    it("reagenda e incrementa rescheduledCount quando não há conflito", async () => {
      const tx = buildTxMock();
      const prisma = buildPrismaMock(tx);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.rescheduleForConsumer("appt-1", { startAt: FUTURE_DATE }, consumer);

      expect(tx.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rescheduledCount: { increment: 1 } }),
        }),
      );
    });

    it("lança ConflictException quando o novo horário colide", async () => {
      const tx = buildTxMock({
        appointment: {
          findFirst: jest.fn().mockResolvedValue({ id: "other" }),
          update: jest.fn(),
        },
      });
      const prisma = buildPrismaMock(tx);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.rescheduleForConsumer("appt-1", { startAt: FUTURE_DATE }, consumer)).rejects.toThrow(
        ConflictException,
      );
    });

    it("lança BadRequestException se o atendimento estiver finalizado", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(
        hydratedAppointment({ status: AppointmentStatus.COMPLETED }),
      );
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.rescheduleForConsumer("appt-1", { startAt: FUTURE_DATE }, consumer)).rejects.toThrow(
        BadRequestException,
      );
    });

    // Regressão: applyReschedule usava findUnique(professionalId_serviceId) sem NENHUMA
    // checagem de tenant pro professionalId vindo do body (dto.professionalId) — nem em JS.
    // O filtro de tenantId (o do PRÓPRIO agendamento, não o vindo do body) tem que estar no WHERE.
    it("busca o vínculo profissional↔serviço de destino já filtrando pelo tenantId do agendamento", async () => {
      const tx = buildTxMock();
      const prisma = buildPrismaMock(tx);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.rescheduleForConsumer("appt-1", {
        startAt: FUTURE_DATE,
        professionalId: "prof-2",
      }, consumer);

      expect(prisma.professionalService.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            professionalId: "prof-2",
            serviceId: "svc-1",
            professional: expect.objectContaining({ tenantId: "tenant-1" }),
            service: expect.objectContaining({ tenantId: "tenant-1" }),
          }),
        }),
      );
    });
  });

  describe("rescheduleByStaff", () => {
    const professional: AuthenticatedUser = {
      userId: "u-2",
      tenantId: "tenant-1",
      role: Role.PROFESSIONAL,
      professionalId: "prof-2",
    };

    it("recusa PROFESSIONAL remarcando para a agenda de outro profissional", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(
        service.rescheduleByStaff(professional, "appt-1", {
          startAt: FUTURE_DATE,
          professionalId: "prof-1",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("permite PROFESSIONAL remarcar mantendo a própria agenda (professionalId omitido ou igual ao seu)", async () => {
      const tx = buildTxMock();
      const prisma = buildPrismaMock(tx);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(
        hydratedAppointment({ professionalId: "prof-2" }),
      );
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(
        service.rescheduleByStaff(professional, "appt-1", { startAt: FUTURE_DATE }),
      ).resolves.toBeDefined();
    });
  });

  describe("cancelByStaff", () => {
    it("permite a recepção cancelar um atendimento IN_SERVICE (corrigir status marcado errado)", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(
        hydratedAppointment({ status: AppointmentStatus.IN_SERVICE }),
      );
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      const result = await service.cancelByStaff(owner, "appt-1");

      expect(result.status).toBe(AppointmentStatus.CANCELED);
    });
  });

  describe("área do cliente logado (Consumer, cross-salão)", () => {
    it("cancelForConsumer lança BadRequestException ao tentar cancelar um atendimento IN_SERVICE", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(
        hydratedAppointment({ status: AppointmentStatus.IN_SERVICE }),
      );
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.cancelForConsumer("appt-1", consumer)).rejects.toThrow(BadRequestException);
    });

    // Regressão: o dono entra no WHERE via relação (Consumer → ConsumerTenantLink → Client).
    // Buscar só por id e comparar depois abriria janela de IDOR e vazaria por 403 vs. 404 se o
    // atendimento de outro consumidor existe.
    it("localiza o atendimento já filtrando pelo consumerId dono (não busca por id e compara depois)", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.cancelForConsumer("appt-1", consumer);

      expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "appt-1", client: { consumerLink: { consumerId: "consumer-1" } } },
        }),
      );
    });

    it("atendimento de outro consumidor cai no mesmo NotFoundException de 'não existe' (nunca 403)", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.cancelForConsumer("appt-de-outro", consumer)).rejects.toThrow(NotFoundException);
      await expect(
        service.rescheduleForConsumer("appt-de-outro", { startAt: FUTURE_DATE }, consumer),
      ).rejects.toThrow(NotFoundException);
    });

    it("findAllForConsumer devolve [] sem vínculo algum, sem consultar atendimentos", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.consumerTenantLink.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(service.findAllForConsumer(consumer)).resolves.toMatchObject({
        items: [],
        total: 0,
        page: 1,
        pageCount: 1,
      });
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it("findAllForConsumer agrega os clientIds de todos os tenants numa consulta só, com o nome do salão", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.consumerTenantLink.findMany as jest.Mock).mockResolvedValue([
        { clientId: "client-a" },
        { clientId: "client-b" },
      ]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([hydratedAppointment()]);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      const result = await service.findAllForConsumer(consumer);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: { in: ["client-a", "client-b"] } } }),
      );
      expect(result.items[0].tenant).toEqual({ slug: "slug", name: "Salão Teste" });
    });

    // Regressão: a listagem já foi "findMany take: 200" sem paginação — histórico grande era
    // carregado inteiro a cada abertura da conta. Agora skip/take e o total vêm do banco.
    it("findAllForConsumer pagina no banco (skip/take) e devolve total e pageCount", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(23);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([hydratedAppointment()]);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      const result = await service.findAllForConsumer(consumer, { page: 3, pageSize: 10 });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result).toMatchObject({ total: 23, page: 3, pageSize: 10, pageCount: 3 });
    });

    it("scope=upcoming filtra confirmados futuros em ordem crescente; past é o complemento", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(0);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.findAllForConsumer(consumer, { scope: "upcoming" });
      const upcoming = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0];
      expect(upcoming.where.status).toBe(AppointmentStatus.CONFIRMED);
      expect(upcoming.orderBy).toEqual({ startAt: "asc" });

      await service.findAllForConsumer(consumer, { scope: "past", tenantSlug: "salao-x" });
      const past = (prisma.appointment.findMany as jest.Mock).mock.calls[1][0];
      expect(past.where.NOT).toMatchObject({ status: AppointmentStatus.CONFIRMED });
      expect(past.where.tenant).toEqual({ slug: "salao-x" });
      expect(past.orderBy).toEqual({ startAt: "desc" });
    });

    it("createFromPublicLink deriva nome/telefone do Client de ensureLink, nunca do body", async () => {
      const tx = buildTxMock();
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);

      await service.createFromPublicLink(
        "slug",
        { ...baseDto, clientName: "Injetado", clientPhone: "000" } as never,
        consumer,
      );

      const data = (tx.appointment.create as jest.Mock).mock.calls[0][0].data;
      expect(data.clientName).toBe("Cliente Teste");
      expect(data.clientPhone).toBe("11999998888");
      expect(data.clientId).toBe("client-1");
      expect(consumerAuth.ensureLink).toHaveBeenCalledWith(tx, "consumer-1", "tenant-1");
    });
  });

  describe("findForAdmin", () => {
    // Regressão: from/to vinham direto de @Query sem DTO — new Date("lixo") gerava um
    // Invalid Date que ia parar no WHERE do Prisma sem checagem, virando 500 em vez de 400.
    it("lança BadRequestException com from/to inválidos", async () => {
      const service = new AppointmentsService(buildPrismaMock(buildTxMock()), clientsService, consumerAuth, notifier);
      await expect(service.findForAdmin(owner, "nao-e-uma-data")).rejects.toThrow(
        BadRequestException,
      );
    });

    // Regressão: sem from/to, findForAdmin buscava o histórico inteiro do tenant sem
    // nenhum teto — uma chamada sem filtro de data (ou um tenant com muitos anos de dado)
    // virava uma query pesada sem limite.
    it("limita a busca com take mesmo sem filtro de data", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.findForAdmin(owner);

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 }),
      );
    });

    it("aplica skip e take quando parâmetros de paginação são informados", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.findForAdmin(owner, undefined, undefined, { page: 3, pageSize: 25 });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });
  });

  describe("getCalendar", () => {
    const range = {
      from: new Date().toISOString(),
      to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    function calendarPrisma() {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([hydratedAppointment()]);
      return prisma;
    }

    it("devolve profissionais, atendimentos e bloqueios do intervalo", async () => {
      const service = new AppointmentsService(calendarPrisma(), clientsService, consumerAuth, notifier);

      const result = await service.getCalendar(owner, range.from, range.to);

      expect(result.professionals).toHaveLength(1);
      expect(result.appointments).toHaveLength(1);
      expect(result.appointments[0].items).toBeDefined();
    });

    it("PROFESSIONAL só enxerga a própria coluna", async () => {
      const prisma = calendarPrisma();
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);
      const pro: AuthenticatedUser = {
        userId: "u-2",
        tenantId: "tenant-1",
        role: Role.PROFESSIONAL,
        professionalId: "prof-2",
      };

      await service.getCalendar(pro, range.from, range.to, "prof-999");

      const where = (prisma.professional.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.id).toBe("prof-2");
    });

    it("recusa intervalo maior que 45 dias", async () => {
      const service = new AppointmentsService(calendarPrisma(), clientsService, consumerAuth, notifier);
      await expect(
        service.getCalendar(
          owner,
          range.from,
          new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("updateStatus", () => {
    it("permite CONFIRMED -> IN_SERVICE", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      const result = await service.updateStatus(owner, "appt-1", { status: "IN_SERVICE" });

      expect(result.status).toBe(AppointmentStatus.IN_SERVICE);
    });

    it("recusa transição inválida COMPLETED -> IN_SERVICE", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(
        hydratedAppointment({ status: AppointmentStatus.COMPLETED }),
      );
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await expect(
        service.updateStatus(owner, "appt-1", { status: "IN_SERVICE" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("carimba noShowAt ao marcar NO_SHOW", async () => {
      const prisma = buildPrismaMock(buildTxMock());
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);

      await service.updateStatus(owner, "appt-1", { status: "NO_SHOW" });

      const data = (prisma.appointment.update as jest.Mock).mock.calls[0][0].data;
      expect(data.noShowAt).toBeInstanceOf(Date);
    });
  });

  // Lembrete: atendimento marcado para dentro de 24 h já nasce "lembrado" (a confirmação acabou de sair); para além
  // disso fica nulo e a varredura envia. Remarcar recalcula.
  describe("marca do lembrete (reminderSentAt)", () => {
    const IN_2_HOURS = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const IN_3_DAYS = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const staffDto = (startAt: string) => ({
      professionalId: "prof-1",
      startAt,
      items: [{ serviceId: "svc-1" }],
      clientName: "Novo Cliente",
      clientPhone: "11988887777",
    });

    it("agendamento público para daqui a 2 h: sem lembrete pendente", async () => {
      const tx = buildTxMock();
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);
      await service.createFromPublicLink("slug", { ...baseDto, startAt: IN_2_HOURS }, consumer);
      expect((tx.appointment.create as jest.Mock).mock.calls[0][0].data.reminderSentAt).toBeInstanceOf(Date);
    });

    it("agendamento público para daqui a 3 dias: lembrete pendente (nulo)", async () => {
      const tx = buildTxMock();
      const service = new AppointmentsService(buildPrismaMock(tx), clientsService, consumerAuth, notifier);
      await service.createFromPublicLink("slug", { ...baseDto, startAt: IN_3_DAYS }, consumer);
      expect((tx.appointment.create as jest.Mock).mock.calls[0][0].data.reminderSentAt).toBeNull();
    });

    it("agendamento pela recepção segue a mesma regra", async () => {
      const soon = buildTxMock();
      await new AppointmentsService(buildPrismaMock(soon), clientsService, consumerAuth, notifier).createByStaff(owner, staffDto(IN_2_HOURS));
      expect((soon.appointment.create as jest.Mock).mock.calls[0][0].data.reminderSentAt).toBeInstanceOf(Date);

      const later = buildTxMock();
      await new AppointmentsService(buildPrismaMock(later), clientsService, consumerAuth, notifier).createByStaff(owner, staffDto(IN_3_DAYS));
      expect((later.appointment.create as jest.Mock).mock.calls[0][0].data.reminderSentAt).toBeNull();
    });

    it("remarcar para além de 24 h devolve o lembrete a pendente; para dentro de 24 h o dispensa", async () => {
      for (const [startAt, expectDate] of [[IN_3_DAYS, false], [IN_2_HOURS, true]] as const) {
        const tx = buildTxMock();
        const prisma = buildPrismaMock(tx);
        (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment());
        const service = new AppointmentsService(prisma, clientsService, consumerAuth, notifier);
        await service.rescheduleByStaff(owner, "appt-1", { startAt });
        const data = (tx.appointment.update as jest.Mock).mock.calls[0][0].data;
        if (expectDate) expect(data.reminderSentAt).toBeInstanceOf(Date);
        else expect(data.reminderSentAt).toBeNull();
      }
    });
  });

  // A notificação é persistida na MESMA transação da gravação, com o ator e o tenant corretos.
  describe("notificações por e-mail", () => {
    function setup(appointmentOverrides: Record<string, unknown> = {}) {
      const tx = buildTxMock();
      const prisma = buildPrismaMock(tx);
      (prisma.appointment.findFirst as jest.Mock).mockResolvedValue(hydratedAppointment(appointmentOverrides));
      const notify = jest.fn().mockResolvedValue(undefined);
      const service = new AppointmentsService(prisma, clientsService, consumerAuth, { enqueue: notify } as unknown as AppointmentNotifierService);
      return { tx, prisma, notify, service };
    }

    it("agendamento público: avisa a equipe e confirma ao cliente, escopo no tenant do slug", async () => {
      const { service, notify } = setup();
      await service.createFromPublicLink("slug", baseDto, consumer);
      expect(notify).toHaveBeenCalledWith(expect.any(Object), "CREATED", "appt-1", "tenant-1", "CLIENT", { alsoConfirmToClient: true });
    });

    it("agendamento pela recepção: avisa o cliente (ator STAFF)", async () => {
      const { service, notify } = setup();
      await service.createByStaff(owner, {
        professionalId: "prof-1",
        startAt: FUTURE_DATE,
        items: [{ serviceId: "svc-1" }],
        clientName: "Novo Cliente",
        clientPhone: "11988887777",
      });
      expect(notify).toHaveBeenCalledWith(expect.any(Object), "CREATED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: true });
    });

    it("conflito de horário (nada gravado) não dispara e-mail", async () => {
      const tx = buildTxMock({
        appointment: { findFirst: jest.fn().mockResolvedValue({ id: "existing" }), create: jest.fn() },
      });
      const notify = jest.fn().mockResolvedValue(undefined);
      const service = new AppointmentsService(
        buildPrismaMock(tx),
        clientsService,
        consumerAuth,
        { enqueue: notify } as unknown as AppointmentNotifierService,
      );
      await expect(service.createFromPublicLink("slug", baseDto, consumer)).rejects.toThrow(ConflictException);
      expect(notify).not.toHaveBeenCalled();
    });

    it("cliente cancela: ator CLIENT; recepção cancela: ator STAFF", async () => {
      const byClient = setup();
      await byClient.service.cancelForConsumer("appt-1", consumer);
      expect(byClient.notify).toHaveBeenCalledWith(expect.any(Object), "CANCELED", "appt-1", "tenant-1", "CLIENT", expect.any(Object));

      const byStaff = setup();
      await byStaff.service.cancelByStaff(owner, "appt-1");
      expect(byStaff.notify).toHaveBeenCalledWith(expect.any(Object), "CANCELED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: true });
    });

    it("cliente remarca: ator CLIENT; recepção remarca: ator STAFF", async () => {
      const byClient = setup();
      await byClient.service.rescheduleForConsumer("appt-1", { startAt: FUTURE_DATE }, consumer);
      expect(byClient.notify).toHaveBeenCalledWith(expect.any(Object), "RESCHEDULED", "appt-1", "tenant-1", "CLIENT", expect.any(Object));

      const byStaff = setup();
      await byStaff.service.rescheduleByStaff(owner, "appt-1", { startAt: FUTURE_DATE });
      expect(byStaff.notify).toHaveBeenCalledWith(expect.any(Object), "RESCHEDULED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: true });
    });

    it("o profissional que agenda/cancela/remarca na PRÓPRIA agenda não é avisado do que ele mesmo fez", async () => {
      const own: AuthenticatedUser = { userId: "u-9", tenantId: "tenant-1", role: Role.PROFESSIONAL, professionalId: "prof-1" };

      const created = setup();
      await created.service.createByStaff(own, {
        professionalId: "prof-1",
        startAt: FUTURE_DATE,
        items: [{ serviceId: "svc-1" }],
        clientName: "Novo Cliente",
        clientPhone: "11988887777",
      });
      expect(created.notify).toHaveBeenCalledWith(expect.any(Object), "CREATED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: false });

      const canceled = setup({ professionalId: "prof-1" });
      await canceled.service.cancelByStaff(own, "appt-1");
      expect(canceled.notify).toHaveBeenCalledWith(expect.any(Object), "CANCELED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: false });

      const moved = setup({ professionalId: "prof-1" });
      await moved.service.rescheduleByStaff(own, "appt-1", { startAt: FUTURE_DATE });
      expect(moved.notify).toHaveBeenCalledWith(expect.any(Object), "RESCHEDULED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: false });
    });

    it("cancelar atendimento já cancelado (erro de negócio) não dispara e-mail", async () => {
      const { service, notify } = setup({ status: AppointmentStatus.CANCELED });
      await expect(service.cancelByStaff(owner, "appt-1")).rejects.toThrow(BadRequestException);
      expect(notify).not.toHaveBeenCalled();
    });
  });
});

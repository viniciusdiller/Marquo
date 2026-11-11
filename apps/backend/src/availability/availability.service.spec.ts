import { NotFoundException } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";
import { PrismaService } from "../prisma/prisma.service";

// 2024-01-01 é uma segunda-feira (MONDAY) — data fixa usada para tornar os testes determinísticos.
const MONDAY = "2024-01-01";

function buildPrismaMock() {
  return {
    tenant: { findUnique: jest.fn() },
    professional: { findFirst: jest.fn() },
    professionalService: { findFirst: jest.fn() },
    workingHours: { findMany: jest.fn() },
    appointment: { findMany: jest.fn() },
    timeBlock: { findMany: jest.fn() },
  } as unknown as PrismaService;
}

describe("AvailabilityService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AvailabilityService;

  beforeAll(() => {
    jest.useFakeTimers();
    // Fixamos o momento "agora" como 2024-01-01 às 06:00 BRT (09:00 UTC)
    jest.setSystemTime(new Date("2024-01-01T09:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AvailabilityService(prisma);

    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ 
      id: "tenant-1",
      minSchedulingLeadTimeMinutes: 0,
      maxSchedulingLeadTimeDays: 365,
    });
    (prisma.professional.findFirst as jest.Mock).mockResolvedValue({
      id: "prof-1",
      slotGranularityMinutes: 15,
    });
    (prisma.professionalService.findFirst as jest.Mock).mockResolvedValue({
      durationMinutes: null,
      isActive: true,
      service: { id: "svc-1", tenantId: "tenant-1", durationMinutes: 60, isActive: true },
    });
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timeBlock.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("gera exatamente um slot quando a janela de trabalho cabe exatamente uma vez a duração do serviço", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 540, endMinute: 600 }, // 09:00–10:00
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    expect(slots).toHaveLength(1);
    expect(slots[0].startAt).toContain("2024-01-01T09:00:00");
    expect(slots[0].endAt).toContain("2024-01-01T10:00:00");
  });

  it("gera múltiplos slots respeitando a granularidade dentro de uma janela maior", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 480, endMinute: 600 }, // 08:00–10:00 (2h), serviço de 60min, granularidade 15min
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    // candidatos possíveis: 08:00, 08:15, 08:30, 08:45, 09:00 (09:00+60=10:00 ainda cabe)
    expect(slots).toHaveLength(5);
    expect(slots[0].startAt).toContain("08:00:00");
    expect(slots[slots.length - 1].startAt).toContain("09:00:00");
  });

  it("exclui slots que colidem com um booking confirmado existente", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 540, endMinute: 660 }, // 09:00–11:00
    ]);
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue([
      {
        startAt: new Date("2024-01-01T12:00:00.000Z"), // 09:00 America/Sao_Paulo (UTC-3)
        endAt: new Date("2024-01-01T13:00:00.000Z"), // 10:00 America/Sao_Paulo
      },
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    // janela 09:00–11:00, serviço 60min: candidatos 09:00,09:15,...,10:00.
    // booking ocupa 09:00–10:00, então só sobra o candidato às 10:00.
    expect(slots).toHaveLength(1);
    expect(slots[0].startAt).toContain("10:00:00");
  });

  it("exclui slots que colidem com um bloqueio manual (TimeBlock)", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 540, endMinute: 660 }, // 09:00–11:00
    ]);
    (prisma.timeBlock.findMany as jest.Mock).mockResolvedValue([
      {
        startAt: new Date("2024-01-01T12:00:00.000Z"), // 09:00 local
        endAt: new Date("2024-01-01T13:00:00.000Z"), // 10:00 local
      },
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    expect(slots).toHaveLength(1);
    expect(slots[0].startAt).toContain("10:00:00");
  });

  // "Todo dia" (ex.: almoço): o bloqueio foi criado em outro dia, mas vale na segunda consultada.
  it("exclui slots cobertos por um bloqueio que se repete todo dia, criado em outra data", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 540, endMinute: 660 }, // 09:00–11:00
    ]);
    (prisma.timeBlock.findMany as jest.Mock).mockResolvedValue([
      {
        startAt: new Date("2023-12-20T12:00:00.000Z"), // 09:00 local, criado dias antes
        endAt: new Date("2023-12-20T13:00:00.000Z"), // 10:00 local
        recurrence: "DAILY",
        repeatUntil: null,
      },
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    expect(slots).toHaveLength(1);
    expect(slots[0].startAt).toContain("10:00:00");
  });

  it("bloqueio diário que já terminou (data final antes do dia) não bloqueia", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([{ startMinute: 540, endMinute: 660 }]);
    (prisma.timeBlock.findMany as jest.Mock).mockResolvedValue([
      {
        startAt: new Date("2023-12-20T12:00:00.000Z"),
        endAt: new Date("2023-12-20T13:00:00.000Z"),
        recurrence: "DAILY",
        repeatUntil: new Date("2023-12-31T00:00:00.000Z"),
      },
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    // Sem nenhum bloqueio vigente a janela 09:00–11:00 rende os 5 horários (de 15 em 15 min).
    expect(slots).toHaveLength(5);
  });

  it("a consulta de bloqueios pede os únicos do dia e os diários ainda vigentes", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([{ startMinute: 540, endMinute: 660 }]);
    await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);
    const where = (prisma.timeBlock.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.professionalId).toBe("prof-1");
    expect(where.OR.map((c: { recurrence: string }) => c.recurrence)).toEqual(["NONE", "DAILY"]);
  });

  it("usa a duração override do ProfessionalService quando definida", async () => {
    (prisma.professionalService.findFirst as jest.Mock).mockResolvedValue({
      durationMinutes: 30,
      isActive: true,
      service: { id: "svc-1", tenantId: "tenant-1", durationMinutes: 60, isActive: true },
    });
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 540, endMinute: 600 }, // 09:00–10:00
    ]);

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    // com duração de 30min (override) numa janela de 60min e granularidade 15min: 09:00,09:15,09:30
    expect(slots).toHaveLength(3);
  });

  it("lança NotFoundException se o tenant não existe", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getAvailableSlots("slug-invalido", "prof-1", "svc-1", MONDAY)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("lança NotFoundException se o serviço não está vinculado/ativo para o profissional", async () => {
    (prisma.professionalService.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY)).rejects.toThrow(
      NotFoundException,
    );
  });

  // Regressão: essa busca já foi findUnique(professionalId_serviceId) + checagem de
  // service.tenantId em JS depois de já ter buscado o registro — janela de IDOR. O filtro de
  // tenantId tem que estar dentro do WHERE, não depois.
  it("busca o vínculo profissional↔serviço já filtrando pelo tenantId do tenant resolvido", async () => {
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 540, endMinute: 600 },
    ]);

    await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    expect(prisma.professionalService.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          professionalId: "prof-1",
          serviceId: "svc-1",
          service: expect.objectContaining({ tenantId: "tenant-1" }),
        }),
      }),
    );
  });

  it("não retorna slots cuja antecedência seja menor que minSchedulingLeadTimeMinutes", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ 
      id: "tenant-1",
      minSchedulingLeadTimeMinutes: 120, // 2 horas de antecedência
      maxSchedulingLeadTimeDays: 365,
    });
    
    // Configura a agenda para começar 08:00
    (prisma.workingHours.findMany as jest.Mock).mockResolvedValue([
      { startMinute: 480, endMinute: 600 }, // 08:00–10:00
    ]);

    // O "agora" é 06:30. Slots devem ter no mínimo 2h de antecedência (só a partir das 08:30).
    jest.setSystemTime(new Date("2024-01-01T09:30:00.000Z")); // 06:30 BRT

    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", MONDAY);

    // Candidatos possíveis: 08:00, 08:15, 08:30, 08:45, 09:00
    // Rejeitados por antecedência < 120min (08:30): 08:00, 08:15
    // Aceitos: 08:30, 08:45, 09:00
    expect(slots).toHaveLength(3);
    expect(slots[0].startAt).toContain("08:30:00");
  });

  it("retorna array vazio se o dia solicitado for além do maxSchedulingLeadTimeDays", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ 
      id: "tenant-1",
      minSchedulingLeadTimeMinutes: 0,
      maxSchedulingLeadTimeDays: 5, // Limite de 5 dias
    });

    // Hoje é dia 01. Máximo é dia 06.
    jest.setSystemTime(new Date("2024-01-01T09:00:00.000Z"));

    // Solicitando para dia 08
    const slots = await service.getAvailableSlots("slug", "prof-1", "svc-1", "2024-01-08");

    // Deve retornar vazio e nem chamar o prisma.workingHours (otimização)
    expect(slots).toHaveLength(0);
    expect(prisma.workingHours.findMany).not.toHaveBeenCalled();
  });
});

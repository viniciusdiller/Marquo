import { BadRequestException, ConflictException } from "@nestjs/common";
import { TimeBlocksService } from "./time-blocks.service";
import { PrismaService } from "../prisma/prisma.service";

const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const FUTURE_END = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    professional: { findFirst: jest.fn().mockResolvedValue({ id: "prof-1", tenantId: "tenant-1" }) },
    appointment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    timeBlock: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "block-1", ...data })),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe("TimeBlocksService.create", () => {
  it("cria o bloqueio quando não há agendamento no período", async () => {
    const prisma = buildPrisma();
    const service = new TimeBlocksService(prisma);

    const result = await service.create("tenant-1", {
      professionalId: "prof-1",
      startAt: FUTURE_START,
      endAt: FUTURE_END,
    });

    expect(result.id).toBe("block-1");
  });

  // Regressão: criar um bloqueio (folga/férias) não checava se já havia um agendamento
  // confirmado no mesmo período — o bloqueio era criado por cima, deixando o
  // agendamento e o bloqueio coexistindo de forma inconsistente sem avisar ninguém.
  it("lança ConflictException quando já existe um agendamento ocupando o período", async () => {
    const prisma = buildPrisma({
      appointment: { findFirst: jest.fn().mockResolvedValue({ id: "appt-1" }) },
    });
    const service = new TimeBlocksService(prisma);

    await expect(
      service.create("tenant-1", { professionalId: "prof-1", startAt: FUTURE_START, endAt: FUTURE_END }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.timeBlock.create).not.toHaveBeenCalled();
  });

  it("lança BadRequestException quando o início não é anterior ao término", async () => {
    const prisma = buildPrisma();
    const service = new TimeBlocksService(prisma);

    await expect(
      service.create("tenant-1", { professionalId: "prof-1", startAt: FUTURE_END, endAt: FUTURE_START }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("TimeBlocksService.create: todo dia", () => {
  // 12:00-13:00 locais (America/Sao_Paulo) numa data futura.
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const base = { professionalId: "prof-1", startAt: `${day}T12:00:00-03:00`, endAt: `${day}T13:00:00-03:00` };

  it("grava a repetição diária, sem data final (null)", async () => {
    const prisma = buildPrisma();
    await new TimeBlocksService(prisma).create("tenant-1", { ...base, repeat: "DAILY" });
    expect(prisma.timeBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recurrence: "DAILY", repeatUntil: null }),
    });
  });

  it("grava a data final como o dia civil (00:00Z)", async () => {
    const prisma = buildPrisma();
    const until = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await new TimeBlocksService(prisma).create("tenant-1", { ...base, repeat: "DAILY", repeatUntil: until });
    const data = (prisma.timeBlock.create as jest.Mock).mock.calls[0][0].data;
    expect(data.repeatUntil).toEqual(new Date(`${until}T00:00:00.000Z`));
  });

  it("sem repeat o bloqueio segue único (recurrence NONE)", async () => {
    const prisma = buildPrisma();
    await new TimeBlocksService(prisma).create("tenant-1", base);
    expect(prisma.timeBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recurrence: "NONE", repeatUntil: null }),
    });
  });

  it("recusa repetir quando início e término são em dias diferentes", async () => {
    const prisma = buildPrisma();
    const next = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await expect(
      new TimeBlocksService(prisma).create("tenant-1", { ...base, endAt: `${next}T08:00:00-03:00`, repeat: "DAILY" }),
    ).rejects.toThrow(/mesmo dia/);
    expect(prisma.timeBlock.create).not.toHaveBeenCalled();
  });

  it("recusa data final antes do dia do bloqueio, depois de 2 anos ou com formato inválido", async () => {
    const prisma = buildPrisma();
    const service = new TimeBlocksService(prisma);
    await expect(service.create("tenant-1", { ...base, repeat: "DAILY", repeatUntil: "2020-01-01" })).rejects.toThrow(BadRequestException);
    await expect(service.create("tenant-1", { ...base, repeat: "DAILY", repeatUntil: "2099-01-01" })).rejects.toThrow(/2 anos/);
    await expect(service.create("tenant-1", { ...base, repeat: "DAILY", repeatUntil: "2026-02-31" })).rejects.toThrow(BadRequestException);
    expect(prisma.timeBlock.create).not.toHaveBeenCalled();
  });

  it("data final sem repetição é recusada (não fica ignorada em silêncio)", async () => {
    const prisma = buildPrisma();
    await expect(new TimeBlocksService(prisma).create("tenant-1", { ...base, repeatUntil: "2030-01-01" })).rejects.toThrow(BadRequestException);
  });

  // Regra do bloqueio único estendida: o diário cobre dias futuros, então um atendimento marcado dentro de alguma
  // ocorrência (ex.: às 12:30 daqui a 10 dias) impede a criação.
  it("recusa (409) quando algum agendamento futuro cai dentro de uma ocorrência", async () => {
    const lunchAppt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    lunchAppt.setUTCHours(15, 30, 0, 0); // 12:30 locais
    const prisma = buildPrisma({
      appointment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ startAt: lunchAppt, endAt: new Date(lunchAppt.getTime() + 30 * 60 * 1000) }]),
      },
    });
    await expect(new TimeBlocksService(prisma).create("tenant-1", { ...base, repeat: "DAILY" })).rejects.toThrow(ConflictException);
    expect(prisma.timeBlock.create).not.toHaveBeenCalled();
  });

  it("agendamento fora da janela de hora (ex.: 15:00) não impede o bloqueio diário", async () => {
    const afternoon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    afternoon.setUTCHours(18, 0, 0, 0); // 15:00 locais
    const prisma = buildPrisma({
      appointment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ startAt: afternoon, endAt: new Date(afternoon.getTime() + 30 * 60 * 1000) }]),
      },
    });
    await new TimeBlocksService(prisma).create("tenant-1", { ...base, repeat: "DAILY" });
    expect(prisma.timeBlock.create).toHaveBeenCalled();
  });

  it("a conferência de agendamentos é do profissional e só de status que ocupam a agenda", async () => {
    const prisma = buildPrisma();
    await new TimeBlocksService(prisma).create("tenant-1", { ...base, repeat: "DAILY" });
    const call = (prisma.appointment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.professionalId).toBe("prof-1");
    expect(call.where.status.in).toEqual(expect.arrayContaining(["SCHEDULED"]));
    expect(call.take).toBe(2000);
  });
});

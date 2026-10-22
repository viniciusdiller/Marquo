import { AppointmentStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { AppointmentNotifierService } from "../email/appointment-notifier.service";
import { AppointmentReminderService } from "./appointment-reminder.service";
import { REMINDER_LEAD_MS } from "./reminder.constants";

const NOW = new Date("2026-10-22T12:00:00.000Z");

function build(options: { configured?: boolean; due?: { id: string; tenantId: string }[]; claimCounts?: number[]; deliver?: string } = {}) {
  const findMany = jest.fn().mockResolvedValue(options.due ?? [{ id: "a-1", tenantId: "t-1" }]);
  const claims = [...(options.claimCounts ?? [])];
  const updateMany = jest.fn().mockImplementation(async () => ({ count: claims.length ? claims.shift() : 1 }));
  const prisma = { appointment: { findMany, updateMany } } as unknown as PrismaService;
  const deliverReminder = jest.fn().mockResolvedValue(options.deliver ?? "SENT");
  const notifier = { deliverReminder } as unknown as AppointmentNotifierService;
  const email = { isConfigured: () => options.configured ?? true } as unknown as EmailService;
  return { service: new AppointmentReminderService(prisma, notifier, email), findMany, updateMany, deliverReminder };
}

describe("AppointmentReminderService.sendDueReminders", () => {
  it("busca só atendimentos futuros, dentro das próximas 24 h, ainda não lembrados e que ainda vão acontecer", async () => {
    const { service, findMany } = build();
    await service.sendDueReminders(NOW);

    const where = findMany.mock.calls[0][0].where;
    expect(where.reminderSentAt).toBeNull();
    expect(where.status.in).toEqual([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]);
    expect(where.startAt.gt).toEqual(NOW);
    expect(where.startAt.lte).toEqual(new Date(NOW.getTime() + REMINDER_LEAD_MS));
  });

  it("reivindica o atendimento (UPDATE condicional) ANTES de enviar e conta o envio", async () => {
    const { service, updateMany, deliverReminder } = build();

    await expect(service.sendDueReminders(NOW)).resolves.toBe(1);

    const claim = updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "a-1", tenantId: "t-1", reminderSentAt: null });
    expect(claim.data).toEqual({ reminderSentAt: NOW });
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(deliverReminder.mock.invocationCallOrder[0]);
    expect(deliverReminder).toHaveBeenCalledWith("a-1", "t-1");
  });

  it("outra varredura já reivindicou (count 0): não envia de novo (sem lembrete duplicado)", async () => {
    const { service, deliverReminder } = build({ claimCounts: [0] });
    await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
    expect(deliverReminder).not.toHaveBeenCalled();
  });

  it("sem e-mail do cliente (SKIPPED) ou provedor com falha (FAILED): não conta como enviado e não repete", async () => {
    for (const deliver of ["SKIPPED", "FAILED"]) {
      const { service, updateMany } = build({ deliver });
      await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
      // Uma única escrita (a reivindicação): nada devolve o atendimento para nova tentativa.
      expect(updateMany).toHaveBeenCalledTimes(1);
    }
  });

  it("erro ao enviar um lembrete não interrompe os demais", async () => {
    const { service, deliverReminder } = build({
      due: [
        { id: "a-1", tenantId: "t-1" },
        { id: "a-2", tenantId: "t-1" },
      ],
    });
    deliverReminder.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("SENT");
    await expect(service.sendDueReminders(NOW)).resolves.toBe(1);
    expect(deliverReminder).toHaveBeenCalledTimes(2);
  });

  it("sem e-mail configurado não lê nem reivindica nada (os atendimentos não são 'gastos')", async () => {
    const { service, findMany, updateMany } = build({ configured: false });
    await expect(service.sendDueReminders(NOW)).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("limita o tamanho de cada varredura", async () => {
    const { service, findMany } = build();
    await service.sendDueReminders(NOW);
    expect(findMany.mock.calls[0][0].take).toBe(50);
  });
});

describe("AppointmentReminderService.run", () => {
  it("nunca lança (a tarefa agendada não pode derrubar o processo) e libera para a próxima varredura", async () => {
    const { service, findMany } = build();
    findMany.mockRejectedValueOnce(new Error("db fora"));
    await expect(service.run()).resolves.toBeUndefined();
    findMany.mockResolvedValueOnce([]);
    await service.run();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

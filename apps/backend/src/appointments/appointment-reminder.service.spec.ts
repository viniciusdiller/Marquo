import { PrismaService } from "../prisma/prisma.service";
import { AppointmentNotifierService } from "../email/appointment-notifier.service";
import { AppointmentReminderService } from "./appointment-reminder.service";

it("persists reminders under a transaction and never marks them delivered while enqueuing", async () => {
  const enqueueReminder = jest.fn().mockResolvedValue(undefined);
  const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "a", tenantId: "t" }]),
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
  const service = new AppointmentReminderService(prisma as unknown as PrismaService, { enqueueReminder } as unknown as AppointmentNotifierService);
  await expect(service.sendDueReminders(new Date())).resolves.toBe(1);
  expect(enqueueReminder).toHaveBeenCalledWith(tx, "a", "t");
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
});

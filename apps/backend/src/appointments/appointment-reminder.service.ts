import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentNotifierService } from "../email/appointment-notifier.service";
import { REMINDER_LEAD_MS } from "./reminder.constants";

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly notifier: AppointmentNotifierService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { await this.sendDueReminders(new Date()); }
    catch { this.logger.warn("Falha ao enfileirar lembretes."); }
    finally { this.running = false; }
  }

  // Includes pre-migration appointments; deduplication is durable and versioned by reschedule.
  // No provider calls here. Multiple replicas can scan safely; unique keys arbitrate races.
  async sendDueReminders(now: Date): Promise<number> {
    const due = await this.prisma.$queryRaw<{ id: string; tenantId: string }[]>`
      SELECT a."id", a."tenantId" FROM "Appointment" a
      WHERE a."reminderSentAt" IS NULL AND a."status" IN ('SCHEDULED','CONFIRMED')
        AND a."startAt" > ${now} AND a."startAt" <= ${new Date(now.getTime() + REMINDER_LEAD_MS)}
        AND NOT EXISTS (SELECT 1 FROM "NotificationOutbox" n
          WHERE n."appointmentId"=a."id" AND n."event"='REMINDER'
            AND n."appointmentVersion"=a."rescheduledCount")
      ORDER BY a."startAt", a."id" LIMIT 500
    `;
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id"=${row.id} FOR UPDATE`;
        await this.notifier.enqueueReminder(tx, row.id, row.tenantId);
      });
    }
    return due.length;
  }
}

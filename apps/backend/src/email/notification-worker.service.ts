import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { randomUUID } from "crypto";
import { NotificationOutbox } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { EmailMessage, EmailService } from "./email.service";

const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 8;
// Resend keeps idempotency keys for 24h. Never retry an ambiguous send outside that window.
const RETRY_WINDOW_MS = 23 * 60 * 60_000;

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  @Cron("*/5 * * * * *")
  async run(): Promise<void> {
    if (this.running || !this.email.isConfigured()) return;
    this.running = true;
    const deadline = Date.now() + 40_000;
    try {
      while (Date.now() < deadline) {
        const rows = await this.claimBatch();
        if (!rows.length) break;
        await Promise.all(rows.map((row) => this.process(row)));
      }
    } catch { this.logger.warn("Falha no processamento da fila de notificações."); }
    finally { this.running = false; }
  }

  async claimBatch(): Promise<NotificationOutbox[]> {
    const token = randomUUID();
    // Expire exhausted jobs even when a worker crashed during its final attempt.
    await this.prisma.notificationOutbox.updateMany({
      where: { status: { in: ["PENDING", "PROCESSING"] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
        AND: [{ OR: [{ attempts: { gte: MAX_ATTEMPTS } }, { firstAttemptAt: { lt: new Date(Date.now() - RETRY_WINDOW_MS) } }] }],
      }, data: { status: "FAILED", lockToken: null, lockedUntil: null, lastError: "RETRY_EXHAUSTED" },
    });
    return this.prisma.$queryRaw<NotificationOutbox[]>`
      UPDATE "NotificationOutbox" n SET "status"='PROCESSING', "lockToken"=${token},
        "lockedUntil"=now() + ${LEASE_MS} * interval '1 millisecond',
        "attempts"=n."attempts"+1, "firstAttemptAt"=COALESCE(n."firstAttemptAt",now())
      WHERE n."id" IN (
        SELECT "id" FROM "NotificationOutbox"
        WHERE ("status"='PENDING' AND "availableAt"<=now())
          OR ("status"='PROCESSING' AND "lockedUntil"<now())
        ORDER BY "availableAt", "id" LIMIT 5 FOR UPDATE SKIP LOCKED
      ) RETURNING n.*
    `;
  }

  async process(job: NotificationOutbox): Promise<void> {
    const ownership = { id: job.id, status: "PROCESSING" as const, lockToken: job.lockToken };
    try {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: job.appointmentId, tenantId: job.tenantId },
        select: { startAt: true, status: true, rescheduledCount: true, tenant: { select: { deletedAt: true } } },
      });
      if (!appointment || appointment.tenant.deletedAt || (job.event === "REMINDER" &&
        (appointment.rescheduledCount !== job.appointmentVersion || appointment.startAt <= new Date() ||
          !["SCHEDULED", "CONFIRMED"].includes(appointment.status)))) {
        await this.prisma.notificationOutbox.updateMany({ where: ownership, data: { status: "SKIPPED", payload: {}, lockToken: null, lockedUntil: null } });
        return;
      }
      const sent = await this.email.send(job.payload as unknown as EmailMessage, `marquo-notification/${job.id}`);
      if (!sent) throw new Error("PROVIDER_FAILURE");
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.notificationOutbox.updateMany({ where: ownership,
          data: { status: "SENT", sentAt: new Date(), payload: {}, lockToken: null, lockedUntil: null, lastError: null } });
        if (result.count && job.event === "REMINDER") {
          await tx.appointment.updateMany({
            where: { id: job.appointmentId, tenantId: job.tenantId, rescheduledCount: job.appointmentVersion },
            data: { reminderSentAt: new Date() },
          });
        }
      });
    } catch {
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      await this.prisma.notificationOutbox.updateMany({ where: ownership, data: {
        status: exhausted ? "FAILED" : "PENDING", lastError: "DELIVERY_FAILED",
        availableAt: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** (job.attempts - 1))),
        lockToken: null, lockedUntil: null,
      } });
    }
  }
}

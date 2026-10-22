import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppointmentStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { AppointmentNotifierService } from "../email/appointment-notifier.service";
import { REMINDER_LEAD_MS } from "./reminder.constants";

const BATCH_SIZE = 50;
// Só atendimentos que ainda vão acontecer: um atendimento em andamento, concluído, cancelado ou faltoso não é lembrado.
const REMINDABLE: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];

// Lembrete por e-mail ao cliente, 24 h antes do horário. Varredura a cada 10 minutos, em todos os negócios.
//
// Sem duplicar: cada atendimento é REIVINDICADO por um UPDATE condicional (`reminderSentAt IS NULL`) ANTES do
// envio, então varreduras sobrepostas ou duas instâncias nunca mandam o mesmo lembrete duas vezes. O custo é a
// garantia ser "no máximo uma vez": se o provedor de e-mail falhar naquele instante, o lembrete se perde (melhor do
// que repetir indefinidamente um e-mail que o provedor recusa). Atendimentos marcados com menos de 24 h de
// antecedência já nascem com `reminderSentAt` preenchido (a confirmação acabou de sair) e voltam a nulo ao remarcar
// para além de 24 h (ver AppointmentsService).
@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: AppointmentNotifierService,
    private readonly email: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run(): Promise<void> {
    // Uma varredura por vez neste processo (a anterior pode demorar se o provedor estiver lento).
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.sendDueReminders(new Date());
      if (sent > 0) this.logger.log(`Lembretes de agendamento enviados: ${sent}.`);
    } catch (error) {
      this.logger.warn(`Falha na varredura de lembretes: ${(error as Error).name}`);
    } finally {
      this.running = false;
    }
  }

  async sendDueReminders(now: Date): Promise<number> {
    // Sem e-mail configurado não há como lembrar ninguém, e reivindicar os atendimentos só os "gastaria".
    if (!this.email.isConfigured()) return 0;

    const due = await this.prisma.appointment.findMany({
      where: {
        reminderSentAt: null,
        status: { in: REMINDABLE },
        startAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_MS) },
      },
      select: { id: true, tenantId: true },
      orderBy: { startAt: "asc" },
      take: BATCH_SIZE,
    });

    let sent = 0;
    for (const { id, tenantId } of due) {
      const claimed = await this.prisma.appointment.updateMany({
        // Reconfere o estado no mesmo UPDATE: pode ter sido cancelado ou lembrado entre a leitura e agora.
        where: { id, tenantId, reminderSentAt: null, status: { in: REMINDABLE } },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;

      try {
        if ((await this.notifier.deliverReminder(id, tenantId)) === "SENT") sent += 1;
      } catch (error) {
        this.logger.warn(`Falha ao enviar lembrete: ${(error as Error).name}`);
      }
    }
    return sent;
  }
}

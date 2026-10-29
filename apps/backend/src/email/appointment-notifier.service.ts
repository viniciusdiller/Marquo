import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { REMINDER_LEAD_MS } from "../appointments/reminder.constants";
import { Prisma, Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { EmailMessage, EmailService } from "./email.service";
import {
  AppointmentEmailData,
  AppointmentEmailEvent,
  buildAppointmentEmail,
} from "./email.templates";

// Quem provocou o evento. Avisa-se o OUTRO lado: o cliente agendou/cancelou -> a equipe é avisada; a equipe
// remarcou/cancelou -> o cliente é avisado. A criação pelo link público avisa os dois (a equipe recebe o
// aviso; o cliente, a confirmação).
export type NotificationActor = "CLIENT" | "STAFF";

export interface NotifyOptions {
  // Criação pelo link público: o cliente também recebe a confirmação.
  alsoConfirmToClient?: boolean;
  // A equipe (recepção ou dono) mexeu na agenda de OUTRO profissional: ele também precisa saber. Só vale quando o ator
  // é STAFF; quando o próprio profissional agenda para si, não há o que avisar.
  notifyProfessional?: boolean;
}

// Templates and recipients are snapshotted inside the appointment transaction.
// External email delivery is handled by NotificationWorkerService after commit.
@Injectable()
export class AppointmentNotifierService {
  private readonly logger = new Logger(AppointmentNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async deliver(
    event: AppointmentEmailEvent,
    appointmentId: string,
    tenantId: string,
    actor: NotificationActor,
    options: NotifyOptions = {},
  ): Promise<void> {
    const messages = await this.messages(this.prisma, event, appointmentId, tenantId, actor, options);
    await Promise.all(messages.map((message) => this.email.send(message)));
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    event: AppointmentEmailEvent,
    appointmentId: string,
    tenantId: string,
    actor: NotificationActor,
    options: NotifyOptions = {},
  ): Promise<void> {
    // Still persist when email is disabled: jobs wait until the provider is configured.
    const appointment = await this.load(appointmentId, tenantId, tx);
    if (!appointment) return;
    const messages = await this.messages(tx, event, appointmentId, tenantId, actor, options);
    await this.persist(tx, event, appointment, tenantId, messages);
  }

  async enqueueReminder(tx: Prisma.TransactionClient, appointmentId: string, tenantId: string): Promise<void> {
    const appointment = await this.load(appointmentId, tenantId, tx);
    if (!appointment || appointment.reminderSentAt || !["SCHEDULED", "CONFIRMED"].includes(appointment.status) || appointment.startAt <= new Date() || appointment.startAt.getTime() > Date.now() + REMINDER_LEAD_MS) return;
    const clientEmail = this.clientEmail(appointment);
    const messages: EmailMessage[] = clientEmail ? [{
      to: [clientEmail], ...buildAppointmentEmail({ ...this.buildBase("REMINDER", appointment), audience: "CLIENT" }),
    }] : [];
    await this.persist(tx, "REMINDER", appointment, tenantId, messages);
  }

  private async persist(tx: Prisma.TransactionClient, event: AppointmentEmailEvent, appointment: LoadedAppointment, tenantId: string, messages: EmailMessage[]) {
    // Empty recipient lists also leave a SKIPPED marker so the scanner can advance.
    const rows = messages.length ? messages : [null];
    await tx.notificationOutbox.createMany({
      data: rows.map((message, index) => ({
        tenantId, appointmentId: appointment.id, event,
        appointmentVersion: appointment.rescheduledCount,
        deduplicationKey: `${appointment.id}:${event}:${appointment.rescheduledCount}:${index}`,
        payload: JSON.parse(JSON.stringify(message ?? {})) as Prisma.InputJsonValue,
        status: message ? "PENDING" : "SKIPPED",
      })),
      skipDuplicates: true,
    });
  }

  private async messages(
    tx: Prisma.TransactionClient, event: AppointmentEmailEvent, appointmentId: string, tenantId: string,
    actor: NotificationActor, options: NotifyOptions,
  ): Promise<EmailMessage[]> {
    const appointment = await this.load(appointmentId, tenantId, tx);
    if (!appointment) return [];
    const base = this.buildBase(event, appointment);

    const sends: EmailMessage[] = [];
    // O dono pode desligar os avisos da EQUIPE; o que o cliente recebe não depende disso.
    const staffAllowed = appointment.tenant.notifyStaffByEmail;

    if (staffAllowed && actor === "STAFF" && options.notifyProfessional && appointment.professional.user.isActive) {
      sends.push(
        ({
          to: [appointment.professional.user.email],
          ...buildAppointmentEmail({ ...base, audience: "STAFF" }),
        }),
      );
    }

    if (staffAllowed && (actor === "CLIENT" || options.alsoConfirmToClient)) {
      const staff = [
        ...appointment.tenant.users.map((user) => user.email),
        ...(appointment.professional.user.isActive ? [appointment.professional.user.email] : []),
      ];
      if (staff.length > 0) {
        sends.push(({ to: staff, ...buildAppointmentEmail({ ...base, audience: "STAFF" }) }));
      }
    }

    if (actor === "STAFF" || options.alsoConfirmToClient) {
      const clientEmail = this.clientEmail(appointment);
      if (clientEmail) {
        sends.push(({ to: [clientEmail], ...buildAppointmentEmail({ ...base, audience: "CLIENT" }) }));
      }
    }

    return sends;
  }

  // Lembrete ao CLIENTE (nunca à equipe). Devolve o que aconteceu, para o ReminderService decidir se devolve a
  // reivindicação do atendimento: SENT = saiu; SKIPPED = não há o que enviar (sem e-mail, atendimento sumiu), não
  // adianta tentar de novo; FAILED = o provedor falhou, vale tentar na próxima varredura.
  async deliverReminder(appointmentId: string, tenantId: string): Promise<"SENT" | "SKIPPED" | "FAILED"> {
    const appointment = await this.load(appointmentId, tenantId);
    if (!appointment) return "SKIPPED";
    const clientEmail = this.clientEmail(appointment);
    if (!clientEmail) return "SKIPPED";

    const message = buildAppointmentEmail({ ...this.buildBase("REMINDER", appointment), audience: "CLIENT" });
    return (await this.email.send({ to: [clientEmail], ...message })) ? "SENT" : "FAILED";
  }

  // Conta de cliente (verificada pelo próprio login) tem prioridade sobre o e-mail digitado na ficha.
  private clientEmail(appointment: LoadedAppointment): string | null {
    return appointment.client?.consumerLink?.consumer.email ?? appointment.client?.email ?? null;
  }

  private load(appointmentId: string, tenantId: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        status: true,
        reminderSentAt: true,
        clientName: true,
        clientPhone: true,
        startAt: true,
        endAt: true,
        rescheduledCount: true,
        items: { orderBy: { position: "asc" }, select: { service: { select: { name: true } } } },
        professional: { select: { user: { select: { name: true, email: true, isActive: true } } } },
        tenant: {
          select: {
            name: true,
            slug: true,
            address: true,
            neighborhood: true,
            city: true,
            whatsappNumber: true,
            notifyStaffByEmail: true,
            users: { where: { role: Role.OWNER, isActive: true }, select: { email: true } },
          },
        },
        client: {
          select: { email: true, consumerLink: { select: { consumer: { select: { email: true } } } } },
        },
      },
    });
  }

  private buildBase(event: AppointmentEmailEvent, appointment: LoadedAppointment): Omit<AppointmentEmailData, "audience"> {
    const frontend = (this.config.get<string>("FRONTEND_URL") ?? "").replace(/\/+$/, "");
    const { address, neighborhood, city, whatsappNumber } = appointment.tenant;
    return {
      event,
      appointmentId: appointment.id,
      rescheduledCount: appointment.rescheduledCount,
      tenantName: appointment.tenant.name,
      clientName: appointment.clientName,
      clientPhone: appointment.clientPhone,
      professionalName: appointment.professional.user.name,
      serviceNames: appointment.items.map((item) => item.service.name),
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      tenantAddress: [address, neighborhood, city].filter((part) => part && part.trim()).join(", ") || undefined,
      tenantPhone: whatsappNumber ?? undefined,
      dashboardUrl: frontend ? `${frontend}/dashboard/agenda` : undefined,
      publicUrl: frontend ? `${frontend}/${appointment.tenant.slug}` : undefined,
      // Imagem servida pelo frontend (apps/frontend/public/brand/email): precisa de URL pública.
      logoUrl: frontend ? `${frontend}/brand/email/marquo-logo.png` : undefined,
      siteUrl: frontend || undefined,
    };
  }
}

type LoadedAppointment = NonNullable<Awaited<ReturnType<AppointmentNotifierService["load"]>>>;

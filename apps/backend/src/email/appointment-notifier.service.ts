import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";
import {
  AppointmentEmailData,
  AppointmentEmailEvent,
  buildAppointmentEmail,
} from "./email.templates";

// Quem provocou o evento. Avisa-se o OUTRO lado: o cliente agendou/cancelou -> a equipe é avisada; a equipe
// remarcou/cancelou -> o cliente é avisado. A criação pelo link público avisa os dois (a equipe recebe o
// aviso; o cliente, a confirmação).
export type NotificationActor = "CLIENT" | "STAFF";

// Dispara os e-mails de agendamento DEPOIS que o atendimento já foi gravado. Nunca lança e nunca é esperado
// por quem chama (fire-and-forget): falha de e-mail não pode desfazer nem atrasar a resposta de um agendamento.
//
// Os destinatários NUNCA vêm do request: são relidos do banco, com tenantId no WHERE (equipe: dono ativo +
// profissional ativo do atendimento; cliente: e-mail da conta de cliente, ou o e-mail do cadastro quando a
// recepção marcou). O conteúdo é um template fixo: ninguém consegue usar isto para mandar texto livre.
@Injectable()
export class AppointmentNotifierService {
  private readonly logger = new Logger(AppointmentNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // Ponto de entrada para quem agenda: engole qualquer erro (inclusive de banco) e devolve já.
  notify(
    event: AppointmentEmailEvent,
    appointmentId: string,
    tenantId: string,
    actor: NotificationActor,
    options: { alsoConfirmToClient?: boolean } = {},
  ): void {
    if (!this.email.isConfigured()) return;
    void this.deliver(event, appointmentId, tenantId, actor, options).catch((error: unknown) => {
      this.logger.warn(`Falha ao preparar e-mail de agendamento (${event}): ${(error as Error).name}`);
    });
  }

  async deliver(
    event: AppointmentEmailEvent,
    appointmentId: string,
    tenantId: string,
    actor: NotificationActor,
    // Criação pelo link público: o cliente também recebe a confirmação.
    options: { alsoConfirmToClient?: boolean } = {},
  ): Promise<void> {
    const appointment = await this.load(appointmentId, tenantId);
    if (!appointment) return;
    const base = this.buildBase(event, appointment);

    const sends: Promise<boolean>[] = [];

    if (actor === "CLIENT" || options.alsoConfirmToClient) {
      const staff = [
        ...appointment.tenant.users.map((user) => user.email),
        ...(appointment.professional.user.isActive ? [appointment.professional.user.email] : []),
      ];
      if (staff.length > 0) {
        sends.push(this.email.send({ to: staff, ...buildAppointmentEmail({ ...base, audience: "STAFF" }) }));
      }
    }

    if (actor === "STAFF" || options.alsoConfirmToClient) {
      const clientEmail = this.clientEmail(appointment);
      if (clientEmail) {
        sends.push(this.email.send({ to: [clientEmail], ...buildAppointmentEmail({ ...base, audience: "CLIENT" }) }));
      }
    }

    await Promise.all(sends);
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

  private load(appointmentId: string, tenantId: string) {
    return this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
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

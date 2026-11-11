import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SLOT_BLOCKING_STATUSES } from "../appointments/appointments.service";
import { CreateTimeBlockDto } from "./dto/create-time-block.dto";
import { anyBlockOverlaps } from "./time-block-occurrences";

// Teto da repetição com data final: evita um "até 2999" que o calendário nunca precisaria percorrer.
const MAX_REPEAT_DAYS = 730;
// Quantos agendamentos futuros conferir ao criar um bloqueio diário (sobra de segurança; acima disso pede-se data final).
const MAX_APPOINTMENTS_CHECKED = 2000;

// Mesmo fuso fixo usado por AppointmentsService/AvailabilityService.
const TENANT_TIMEZONE = "America/Sao_Paulo";

@Injectable()
export class TimeBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateTimeBlockDto) {
    const professional = await this.prisma.professional.findFirst({
      where: { id: dto.professionalId, tenantId },
    });
    if (!professional) {
      throw new NotFoundException("Profissional não encontrado.");
    }

    const startAt = DateTime.fromISO(dto.startAt, { zone: TENANT_TIMEZONE });
    const endAt = DateTime.fromISO(dto.endAt, { zone: TENANT_TIMEZONE });
    if (!startAt.isValid || !endAt.isValid) {
      throw new BadRequestException("Data/hora inválida.");
    }
    if (startAt.toMillis() >= endAt.toMillis()) {
      throw new BadRequestException("O início do bloqueio deve ser anterior ao término.");
    }

    const repeat = dto.repeat ?? "NONE";
    let repeatUntil: Date | null = null;
    if (repeat === "NONE") {
      if (dto.repeatUntil) throw new BadRequestException("A data final só vale para bloqueio que se repete todo dia.");
    } else {
      if (!startAt.hasSame(endAt, "day")) {
        throw new BadRequestException("Para repetir todo dia, o início e o término precisam ser no mesmo dia.");
      }
      if (dto.repeatUntil) {
        const until = DateTime.fromISO(dto.repeatUntil, { zone: TENANT_TIMEZONE }).startOf("day");
        if (!until.isValid) throw new BadRequestException("Data final inválida.");
        if (until < startAt.startOf("day")) {
          throw new BadRequestException("A data final deve ser o dia do bloqueio ou depois.");
        }
        if (until.diff(startAt.startOf("day"), "days").days > MAX_REPEAT_DAYS) {
          throw new BadRequestException("A repetição pode ir até 2 anos à frente. Para mais tempo, deixe sem data final.");
        }
        repeatUntil = new Date(`${until.toISODate()}T00:00:00.000Z`);
      }
    }

    if (repeat === "DAILY") {
      await this.assertNoAppointmentInDailyBlock(dto.professionalId, startAt.toJSDate(), endAt.toJSDate(), repeatUntil);
    }

    const conflictingAppointment = repeat === "DAILY" ? null : await this.prisma.appointment.findFirst({
      where: {
        professionalId: dto.professionalId,
        status: { in: SLOT_BLOCKING_STATUSES },
        startAt: { lt: endAt.toJSDate() },
        endAt: { gt: startAt.toJSDate() },
      },
    });
    if (conflictingAppointment) {
      throw new ConflictException(
        "Já existe um agendamento nesse período. Cancele ou remarque-o antes de bloquear o horário.",
      );
    }

    return this.prisma.timeBlock.create({
      data: {
        tenantId,
        professionalId: dto.professionalId,
        startAt: startAt.toJSDate(),
        endAt: endAt.toJSDate(),
        reason: dto.reason,
        recurrence: repeat,
        repeatUntil,
      },
    });
  }

  // O bloqueio diário vale em dias futuros: recusa se algum agendamento ativo cairia dentro de uma ocorrência (mesma regra
  // do bloqueio único: cancele ou remarque antes).
  private async assertNoAppointmentInDailyBlock(professionalId: string, startAt: Date, endAt: Date, repeatUntil: Date | null) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        professionalId,
        status: { in: SLOT_BLOCKING_STATUSES },
        endAt: { gt: startAt },
        ...(repeatUntil ? { startAt: { lt: new Date(repeatUntil.getTime() + 24 * 60 * 60 * 1000) } } : {}),
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: "asc" },
      take: MAX_APPOINTMENTS_CHECKED,
    });
    const candidate = { startAt, endAt, recurrence: "DAILY" as const, repeatUntil };
    if (appointments.some((appointment) => anyBlockOverlaps([candidate], appointment.startAt, appointment.endAt))) {
      throw new ConflictException(
        "Já existe agendamento nesse horário em algum dia da repetição. Cancele ou remarque-o antes de bloquear.",
      );
    }
  }

  findByProfessional(tenantId: string, professionalId: string) {
    return this.prisma.timeBlock.findMany({
      where: { tenantId, professionalId },
      orderBy: { startAt: "asc" },
    });
  }

  async remove(tenantId: string, id: string) {
    const block = await this.prisma.timeBlock.findFirst({ where: { id, tenantId } });
    if (!block) {
      throw new NotFoundException("Bloqueio não encontrado.");
    }
    await this.prisma.timeBlock.delete({ where: { id } });
  }

  async findOneOrThrow(tenantId: string, id: string) {
    const block = await this.prisma.timeBlock.findFirst({ where: { id, tenantId } });
    if (!block) {
      throw new NotFoundException("Bloqueio não encontrado.");
    }
    return block;
  }
}

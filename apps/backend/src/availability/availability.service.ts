import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { Weekday } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { intervalsOverlap } from "../common/utils/interval.util";

export const TENANT_TIMEZONE = "America/Sao_Paulo";

const WEEKDAY_BY_LUXON_INDEX: Weekday[] = [
  Weekday.SUNDAY, // luxon weekday % 7 === 0 (domingo)
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

export interface AvailableSlot {
  startAt: string;
  endAt: string;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailableSlots(
    tenantSlug: string,
    professionalId: string,
    serviceId: string,
    date: string,
  ): Promise<AvailableSlot[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, minSchedulingLeadTimeMinutes: true, maxSchedulingLeadTimeDays: true },
    });
    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }

    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, tenantId: tenant.id, isActive: true },
    });
    if (!professional) {
      throw new NotFoundException("Profissional não encontrado.");
    }

    const professionalService = await this.prisma.professionalService.findFirst({
      where: {
        professionalId,
        serviceId,
        isActive: true,
        service: { tenantId: tenant.id, isActive: true },
      },
      include: { service: true },
    });
    if (!professionalService) {
      throw new NotFoundException("Serviço não disponível para este profissional.");
    }

    const durationMinutes =
      professionalService.durationMinutes ?? professionalService.service.durationMinutes;

    const dayStart = DateTime.fromISO(date, { zone: TENANT_TIMEZONE }).startOf("day");
    if (!dayStart.isValid) {
      throw new BadRequestException("Data inválida.");
    }

    const now = DateTime.now().setZone(TENANT_TIMEZONE);
    const minLeadTimeBoundary = now.plus({ minutes: tenant.minSchedulingLeadTimeMinutes });
    const maxLeadTimeBoundary = now.startOf("day").plus({ days: tenant.maxSchedulingLeadTimeDays }).endOf("day");

    // Rejeitar dia inteiro se estiver no passado (antes de hoje) ou depois do limite máximo
    if (dayStart < now.startOf("day") || dayStart > maxLeadTimeBoundary) {
      return [];
    }

    const dayEnd = dayStart.plus({ days: 1 });
    const weekday = WEEKDAY_BY_LUXON_INDEX[dayStart.weekday % 7];

    const [workingHours, bookings, timeBlocks] = await Promise.all([
      this.prisma.workingHours.findMany({
        where: { professionalId, weekday },
      }),
      this.prisma.appointment.findMany({
        where: {
          professionalId,
          status: { in: ["SCHEDULED", "CONFIRMED", "IN_SERVICE"] },
          startAt: { lt: dayEnd.toJSDate() },
          endAt: { gt: dayStart.toJSDate() },
        },
        select: { startAt: true, endAt: true },
      }),
      this.prisma.timeBlock.findMany({
        where: {
          professionalId,
          startAt: { lt: dayEnd.toJSDate() },
          endAt: { gt: dayStart.toJSDate() },
        },
        select: { startAt: true, endAt: true },
      }),
    ]);

    const busyRanges = [...bookings, ...timeBlocks].map((item) => ({
      startMinute: Math.floor(DateTime.fromJSDate(item.startAt).diff(dayStart, "minutes").minutes),
      endMinute: Math.ceil(DateTime.fromJSDate(item.endAt).diff(dayStart, "minutes").minutes),
    }));

    const granularity = professional.slotGranularityMinutes;
    const slots: AvailableSlot[] = [];

    for (const interval of workingHours) {
      for (
        let candidateStart = interval.startMinute;
        candidateStart + durationMinutes <= interval.endMinute;
        candidateStart += granularity
      ) {
        const candidateEnd = candidateStart + durationMinutes;
        const candidateStartAt = dayStart.plus({ minutes: candidateStart });

        if (candidateStartAt < minLeadTimeBoundary) {
          continue;
        }

        const candidateRange = { startMinute: candidateStart, endMinute: candidateEnd };
        const hasConflict = busyRanges.some((busy) => intervalsOverlap(candidateRange, busy));
        if (hasConflict) {
          continue;
        }

        slots.push({
          startAt: candidateStartAt.toISO()!,
          endAt: dayStart.plus({ minutes: candidateEnd }).toISO()!,
        });
      }
    }

    return slots;
  }
}

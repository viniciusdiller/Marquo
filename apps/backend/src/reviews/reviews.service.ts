import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, ReviewStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewDto, ReportReviewDto } from "./dto/review-dtos";
import { AuthenticatedConsumer } from "../consumer-auth/types/consumer-auth-user";
import { AuthenticatedUser } from "../auth/types/auth-user";

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  // Atendimentos concluídos do consumidor que ainda não têm avaliação — o que o app mostra
  // como "avalie sua visita".
  async reviewableAppointments(consumer: AuthenticatedConsumer) {
    const links = await this.prisma.consumerTenantLink.findMany({
      where: { consumerId: consumer.consumerId },
      select: { clientId: true },
    });
    if (links.length === 0) return [];

    return this.prisma.appointment.findMany({
      where: {
        clientId: { in: links.map((l) => l.clientId) },
        status: AppointmentStatus.COMPLETED,
        review: null,
      },
      orderBy: { startAt: "desc" },
      take: 20,
      select: {
        id: true,
        startAt: true,
        tenant: { select: { name: true, slug: true } },
        items: { select: { service: { select: { name: true } } } },
      },
    });
  }

  async create(consumer: AuthenticatedConsumer, dto: CreateReviewDto) {
    // Dono do atendimento (consumerId) já entra no WHERE via filtro de relação — não busca
    // por id sozinho e compara depois em JS (isso além de ser a janela de IDOR que o projeto
    // proíbe, também deixa vazar via 403 vs. 404 se o atendimento existe ou não; assim os
    // dois casos caem no mesmo NotFoundException).
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: dto.appointmentId,
        client: { consumerLink: { consumerId: consumer.consumerId } },
      },
      include: { review: true },
    });
    if (!appointment) {
      throw new NotFoundException("Atendimento não encontrado.");
    }
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Só é possível avaliar um atendimento concluído.");
    }
    if (appointment.review) {
      throw new BadRequestException("Este atendimento já foi avaliado.");
    }

    return this.prisma.review.create({
      data: {
        tenantId: appointment.tenantId,
        consumerId: consumer.consumerId,
        appointmentId: appointment.id,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
    });
  }

  // Denúncia pelo dono do estabelecimento — some da vitrine até revisão manual.
  async report(user: AuthenticatedUser, id: string, dto: ReportReviewDto) {
    const review = await this.getOwnedOrThrow(user.tenantId, id);
    return this.prisma.review.update({
      where: { id: review.id },
      data: { status: ReviewStatus.PENDING_REPORT, reportReason: dto.reason.trim() },
    });
  }

  // Ocultar (moderação). Sem reversão automática nesta v1.
  async hide(user: AuthenticatedUser, id: string) {
    const review = await this.getOwnedOrThrow(user.tenantId, id);
    return this.prisma.review.update({
      where: { id: review.id },
      data: { status: ReviewStatus.HIDDEN },
    });
  }

  listForOwner(user: AuthenticatedUser) {
    return this.prisma.review.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        status: true,
        createdAt: true,
        consumer: { select: { name: true } },
      },
    });
  }

  private async getOwnedOrThrow(tenantId: string, id: string) {
    const review = await this.prisma.review.findFirst({ where: { id, tenantId } });
    if (!review) {
      throw new NotFoundException("Avaliação não encontrada.");
    }
    return review;
  }
}

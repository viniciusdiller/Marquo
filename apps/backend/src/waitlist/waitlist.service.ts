import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { WaitlistStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { ConsumerAuthService } from "../consumer-auth/consumer-auth.service";
import { AuthenticatedConsumer } from "../consumer-auth/types/consumer-auth-user";
import { computeBillingStatus, hasBillingAccess } from "../billing/billing-status.util";
import { CreateWaitlistEntryDto } from "./dto/create-waitlist-entry.dto";

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consumerAuth: ConsumerAuthService,
  ) {}

  async createFromPublicLink(
    tenantSlug: string,
    dto: CreateWaitlistEntryDto,
    consumer: AuthenticatedConsumer,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException("Negócio não encontrado.");
    }
    await this.assertTenantAcceptsBookings(tenant.id);

    // serviceId/professionalId vêm do body do link público sem nenhuma relação de FK que
    // force os dois a serem do mesmo tenant — sem essa checagem, um cliente podia entrar na
    // lista de espera do tenant A referenciando o serviço/profissional de outro tenant B, e
    // esse nome de outro negócio vazaria pro dono do tenant A em findAllByTenant (include de
    // service/professional).
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId: tenant.id, isActive: true },
      select: { id: true },
    });
    if (!service) {
      throw new BadRequestException("Serviço não encontrado.");
    }
    if (dto.professionalId) {
      const professional = await this.prisma.professional.findFirst({
        where: { id: dto.professionalId, tenantId: tenant.id, isActive: true },
        select: { id: true },
      });
      if (!professional) {
        throw new BadRequestException("Profissional não encontrado.");
      }
    }

    const client = await this.consumerAuth.ensureLink(this.prisma, consumer.consumerId, tenant.id);

    return this.prisma.waitlistEntry.create({
      data: {
        tenantId: tenant.id,
        serviceId: dto.serviceId,
        professionalId: dto.professionalId,
        clientName: client.name,
        clientPhone: client.phone,
        clientId: client.id,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : undefined,
        notes: dto.notes,
      },
    });
  }

  findAllByTenant(tenantId: string, status?: WaitlistStatus) {
    return this.prisma.waitlistEntry.findMany({
      where: { tenantId, status },
      include: { service: { select: { name: true } }, professional: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  }

  async updateStatus(tenantId: string, id: string, status: WaitlistStatus) {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { id, tenantId } });
    if (!entry) {
      throw new NotFoundException("Registro da lista de espera não encontrado.");
    }
    return this.prisma.waitlistEntry.update({ where: { id }, data: { status } });
  }

  // Mesma regra de AppointmentsService.assertTenantAcceptsBookings — a rota pública
  // (@Public()) não passa pelo TenantBillingGuard.
  private async assertTenantAcceptsBookings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { subscription: true },
    });
    const status = computeBillingStatus(tenant, tenant.subscription);
    if (!hasBillingAccess(status)) {
      throw new ForbiddenException("Este negócio não está aceitando novos agendamentos no momento.");
    }
  }
}

import { randomBytes } from "crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, Role } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";
import { computeBillingStatus } from "../billing/billing-status.util";
import { InternalTenantsQueryDto } from "./dto/internal.dto";

export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_ACTION = "PASSWORD_RESET_LINK";
const TOKEN_BYTES = 32;

@Injectable()
export class InternalService {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Visão de suporte: busca por nome do negócio, slug ou e-mail do dono. `select` explícito: nada de
  // ids de provedor de pagamento, hashes ou tokens.
  async listTenants(query: InternalTenantsQueryDto) {
    const pagination = resolvePagination(query);
    const search = query.search?.trim();
    const where: Prisma.TenantWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { users: { some: { role: Role.OWNER, email: { contains: search.toLowerCase() } } } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          trialEndsAt: true,
          subscription: {
            select: {
              status: true,
              courtesy: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              plan: { select: { name: true } },
            },
          },
          users: { where: { role: Role.OWNER }, select: { email: true, name: true }, take: 1 },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return toPage(
      rows.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
        ownerName: tenant.users[0]?.name ?? null,
        ownerEmail: tenant.users[0]?.email ?? null,
        billingStatus: computeBillingStatus(tenant, tenant.subscription),
        planName: tenant.subscription?.plan.name ?? null,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: tenant.subscription?.cancelAtPeriodEnd ?? false,
      })),
      total,
      pagination,
    );
  }

  // Gera um link de "definir senha" para o DONO do tenant. Só o HASH do token vai para o banco (com
  // validade e uso único, via /auth/set-password), e o link em claro sai UMA vez, na resposta: quem
  // pediu o entrega ao dono por outro canal, depois de confirmar a identidade. Gerar outro link
  // invalida o anterior (o hash é sobrescrito). O registro de auditoria nasce na MESMA transação: não
  // existe link sem trilha, e a trilha nunca guarda o token.
  async createPasswordResetLink(tenantId: string, actor: string) {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: Role.OWNER, isActive: true },
      select: { id: true, email: true },
    });
    if (!owner) throw new NotFoundException("Dono ativo não encontrado para este negócio.");

    const token = randomBytes(TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: owner.id },
        data: { passwordSetTokenHash: hashPasswordSetToken(token), passwordSetTokenExpiresAt: expiresAt },
      }),
      this.prisma.adminAuditLog.create({
        data: { action: PASSWORD_RESET_ACTION, actor, tenantId, targetUserId: owner.id },
      }),
    ]);

    // Nunca o token nem o link: só quem, em qual tenant.
    this.logger.log(`Link de redefinição gerado (tenant ${tenantId}, por ${actor}).`);

    const base = (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
    return {
      link: `${base}/definir-senha?token=${token}`,
      expiresAt,
      ownerEmail: owner.email,
    };
  }
}

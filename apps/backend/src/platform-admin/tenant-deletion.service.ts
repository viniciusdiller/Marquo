import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { rm } from "fs/promises";
import { join } from "path";
import { BillingMethod, Prisma, SubscriptionStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoClient, toBadGateway } from "../billing/payments/mercadopago.client";
import { UPLOADS_DIR } from "../common/constants/uploads";
import { resolvePagination, toPage } from "../common/pagination/paginate";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import {
  BillingStatus,
  computeBillingStatus,
  hasBillingAccess,
  PAST_DUE_GRACE_MS,
} from "../billing/billing-status.util";

export const DELETION_RETENTION_DAYS = 90;
export const AUDIT_TENANT_PURGED = "TENANT_PURGED";
export const AUDIT_TENANT_DELETION_SCHEDULED = "TENANT_DELETION_SCHEDULED";
const SCHEDULED_SUSPENSION_REASON = "Exclusão agendada: aguardando 90 dias";
const DAY_MS = 24 * 60 * 60 * 1000;
// Teto de negócios lidos para montar a lista de candidatos (o estado de cobrança é calculado, não é coluna).
const CANDIDATE_SCAN_CAP = 2_000;
const MIN_REASON = 10;
const MAX_REASON = 300;

// Tabelas com tenantId que a exclusão NÃO apaga, de propósito: os termos prometem guardar registros de pagamento pelo
// prazo legal (assinatura, cobranças, resgate de cupom), e a trilha de auditoria (sem FK para o negócio) também fica. Qualquer outra tabela com tenantId TEM
// de estar na limpeza abaixo: o teste tenant-deletion.schema.spec.ts lê o schema e falha se alguém criar uma tabela nova
// e esquecer dela, o que deixaria dado de cliente para trás.
export const RETAINED_TENANT_MODELS: readonly string[] = ["Subscription", "BillingAttempt", "CouponRedemption", "AdminAuditLog"];

type Tx = Prisma.TransactionClient;

// A ORDEM importa: várias chaves são RESTRICT (o filho precisa sair antes do pai). Conferido contra o Postgres: pagamentos
// de comissão antes do financeiro e do profissional; estoque antes do produto; comandas, caixas, financeiro e pagamentos
// antes dos usuários; agendamentos antes de serviços e profissionais. O resto sai em cascata com o pai (itens da comanda,
// itens do agendamento, horários, vínculo profissional-serviço, tokens de sessão...).
export const PURGE_STEPS: { model: string; run: (tx: Tx, tenantId: string) => Promise<{ count: number }> }[] = [
  { model: "CommissionPayout", run: (tx, tenantId) => tx.commissionPayout.deleteMany({ where: { tenantId } }) },
  { model: "CommissionEntry", run: (tx, tenantId) => tx.commissionEntry.deleteMany({ where: { tenantId } }) },
  { model: "StockMovement", run: (tx, tenantId) => tx.stockMovement.deleteMany({ where: { tenantId } }) },
  { model: "FinancialEntry", run: (tx, tenantId) => tx.financialEntry.deleteMany({ where: { tenantId } }) },
  { model: "FinancialCategory", run: (tx, tenantId) => tx.financialCategory.deleteMany({ where: { tenantId } }) },
  { model: "Payment", run: (tx, tenantId) => tx.payment.deleteMany({ where: { tenantId } }) },
  { model: "Ticket", run: (tx, tenantId) => tx.ticket.deleteMany({ where: { tenantId } }) },
  { model: "CashRegister", run: (tx, tenantId) => tx.cashRegister.deleteMany({ where: { tenantId } }) },
  { model: "Review", run: (tx, tenantId) => tx.review.deleteMany({ where: { tenantId } }) },
  { model: "IntakeResponse", run: (tx, tenantId) => tx.intakeResponse.deleteMany({ where: { tenantId } }) },
  { model: "Appointment", run: (tx, tenantId) => tx.appointment.deleteMany({ where: { tenantId } }) },
  { model: "IntakeForm", run: (tx, tenantId) => tx.intakeForm.deleteMany({ where: { tenantId } }) },
  { model: "WaitlistEntry", run: (tx, tenantId) => tx.waitlistEntry.deleteMany({ where: { tenantId } }) },
  { model: "TimeBlock", run: (tx, tenantId) => tx.timeBlock.deleteMany({ where: { tenantId } }) },
  { model: "CommissionRule", run: (tx, tenantId) => tx.commissionRule.deleteMany({ where: { tenantId } }) },
  { model: "ConsumerTenantLink", run: (tx, tenantId) => tx.consumerTenantLink.deleteMany({ where: { tenantId } }) },
  { model: "Client", run: (tx, tenantId) => tx.client.deleteMany({ where: { tenantId } }) },
  { model: "Service", run: (tx, tenantId) => tx.service.deleteMany({ where: { tenantId } }) },
  { model: "Product", run: (tx, tenantId) => tx.product.deleteMany({ where: { tenantId } }) },
  { model: "Professional", run: (tx, tenantId) => tx.professional.deleteMany({ where: { tenantId } }) },
  { model: "User", run: (tx, tenantId) => tx.user.deleteMany({ where: { tenantId } }) },
  { model: "TenantGalleryImage", run: (tx, tenantId) => tx.tenantGalleryImage.deleteMany({ where: { tenantId } }) },
  { model: "TenantCategory", run: (tx, tenantId) => tx.tenantCategory.deleteMany({ where: { tenantId } }) },
];

export interface DeletionStatus {
  billingStatus: BillingStatus;
  // Quando o acesso terminou (base do prazo de 90 dias). Nulo = ainda tem acesso.
  accessEndedAt: Date | null;
  // Pode ser excluído: o acesso já terminou (nunca um negócio que ainda usa o sistema).
  deletable: boolean;
  // Cumpriu os 90 dias; antes disso só com motivo.
  eligible: boolean;
  eligibleOn: Date | null;
}

type TenantForStatus = { trialEndsAt: Date; suspendedAt: Date | null; deletedAt?: Date | null };
type SubscriptionForStatus = {
  status: SubscriptionStatus;
  courtesy: boolean;
  method: BillingMethod | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
  providerSubscriptionId?: string | null;
} | null;

// Quando o acesso do negócio terminou, a partir do estado de cobrança JÁ calculado (computeBillingStatus, um só lugar).
export function evaluateDeletion(
  tenant: TenantForStatus,
  subscription: SubscriptionForStatus,
  now: Date = new Date(),
): DeletionStatus {
  const billingStatus = computeBillingStatus(tenant, subscription, now.getTime());
  const deletable = !hasBillingAccess(billingStatus) && !tenant.deletedAt;
  if (!deletable) return { billingStatus, accessEndedAt: null, deletable: false, eligible: false, eligibleOn: null };

  const periodEnd = subscription?.currentPeriodEnd ?? null;
  let accessEndedAt: Date;
  switch (billingStatus) {
    case "SUSPENDED":
      accessEndedAt = tenant.suspendedAt as Date;
      break;
    case "TRIAL_EXPIRED":
      accessEndedAt = tenant.trialEndsAt;
      break;
    case "UNPAID":
      accessEndedAt = periodEnd ? new Date(periodEnd.getTime() + PAST_DUE_GRACE_MS) : (subscription?.updatedAt ?? now);
      break;
    default:
      // EXPIRED, PERIOD_ENDED, CANCELED, INCOMPLETE: fim do período pago/da cortesia, ou a última atualização.
      accessEndedAt = periodEnd ?? subscription?.updatedAt ?? now;
  }
  const eligibleOn = new Date(accessEndedAt.getTime() + DELETION_RETENTION_DAYS * DAY_MS);
  return { billingStatus, accessEndedAt, deletable: true, eligible: eligibleOn.getTime() <= now.getTime(), eligibleOn };
}

const SUBSCRIPTION_SELECT = {
  status: true,
  courtesy: true,
  method: true,
  cancelAtPeriodEnd: true,
  currentPeriodEnd: true,
  updatedAt: true,
  providerSubscriptionId: true,
} as const;

// Exclusão dos dados de um negócio, na hora e sem esperar prazo (os 90 dias dos termos são o MÁXIMO que se guarda, não
// um mínimo: a plataforma pode apagar antes). Vale para qualquer negócio, com acesso ou não (teste, cortesia, suspenso,
// com assinatura paga...). Exige a confirmação digitada do endereço; o motivo é opcional e vai para a auditoria junto
// com o autor. Se o negócio paga no CARTÃO, a recorrência é cancelada no Mercado Pago ANTES de apagar (senão o provedor
// seguiria cobrando um negócio que não existe mais); se o cancelamento falhar, nada é apagado.
//
// NADA é apagado sozinho: a plataforma vê a lista, simula e confirma digitando o endereço do negócio. Apaga tudo o que é
// dado operacional (clientes, agenda, comandas, financeiro, equipe, fotos) e deixa só a linha do negócio ANONIMIZADA,
// com assinatura e cobranças (registro de pagamento, que os termos dizem guardar) e a trilha de auditoria. Tudo em UMA
// transação, com a auditoria gravada antes: se qualquer passo falhar, nada é apagado.
@Injectable()
export class TenantDeletionService {
  private readonly logger = new Logger(TenantDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoClient,
  ) {}

  async listCandidates(query: PaginationQueryDto, now: Date = new Date()) {
    const pagination = resolvePagination(query);
    const rows = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        trialEndsAt: true,
        suspendedAt: true,
        subscription: { select: SUBSCRIPTION_SELECT },
      },
      orderBy: { createdAt: "asc" },
      take: CANDIDATE_SCAN_CAP,
    });

    const candidates = rows
      .map((row) => ({ row, status: evaluateDeletion(row, row.subscription, now) }))
      .filter(({ status }) => status.deletable)
      // Os mais antigos sem acesso primeiro (os que já cumpriram o prazo aparecem no topo).
      .sort((a, b) => (a.status.accessEndedAt as Date).getTime() - (b.status.accessEndedAt as Date).getTime())
      .map(({ row, status }) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: row.createdAt,
        billingStatus: status.billingStatus,
        accessEndedAt: status.accessEndedAt,
        eligible: status.eligible,
        eligibleOn: status.eligibleOn,
      }));

    return toPage(candidates.slice(pagination.skip, pagination.skip + pagination.take), candidates.length, pagination);
  }

  // Simulação: o que existe hoje e se já pode ser excluído. Não altera nada.
  async preview(tenantId: string, now: Date = new Date()) {
    const tenant = await this.findTenant(tenantId);
    const status = evaluateDeletion(tenant, tenant.subscription, now);

    const where = { tenantId };
    const [users, professionals, clients, appointments, tickets, products, financialEntries, reviews, intakeResponses, galleryImages] =
      await Promise.all([
        this.prisma.user.count({ where }),
        this.prisma.professional.count({ where }),
        this.prisma.client.count({ where }),
        this.prisma.appointment.count({ where }),
        this.prisma.ticket.count({ where }),
        this.prisma.product.count({ where }),
        this.prisma.financialEntry.count({ where }),
        this.prisma.review.count({ where }),
        this.prisma.intakeResponse.count({ where }),
        this.prisma.tenantGalleryImage.count({ where }),
      ]);

    const blockedReason = tenant.deletedAt ? "Os dados deste negócio já foram excluídos." : null;

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt,
      ...status,
      // Pode ser excluído agora (só não pode o que já foi excluído). `deletable`/`eligible` seguem sendo só a regra dos 90 dias.
      purgeable: blockedReason === null,
      // Paga no cartão: a recorrência será cancelada no Mercado Pago junto com a exclusão.
      cancelsCardSubscription: this.hasCardRecurrence(tenant.subscription),
      blockedReason,
      hasAccess: !status.deletable && !tenant.deletedAt,
      retentionDays: DELETION_RETENTION_DAYS,
      counts: { users, professionals, clients, appointments, tickets, products, financialEntries, reviews, intakeResponses, galleryImages },
    };
  }

  async purge(
    tenantId: string,
    input: { confirmSlug: string; reason?: string },
    actor: string,
    now: Date = new Date(),
  ): Promise<{ purged: true; slug: string }> {
    const tenant = await this.findTenant(tenantId);
    const status = evaluateDeletion(tenant, tenant.subscription, now);

    if (tenant.deletedAt) throw new ConflictException("Os dados deste negócio já foram excluídos.");
    // Confirmação digitada: o endereço exato do negócio (quem apertou sem olhar não exclui).
    if (input.confirmSlug.trim() !== tenant.slug) {
      throw new BadRequestException("A confirmação não confere com o endereço do negócio.");
    }
    // Motivo opcional; se vier, tem tamanho limitado (o DTO já barra; o service é chamado direto em testes).
    const reason = input.reason?.trim() ?? "";
    if (reason.length > MAX_REASON || (reason.length > 0 && reason.length < MIN_REASON)) {
      throw new BadRequestException(`O motivo, quando informado, precisa ter de ${MIN_REASON} a ${MAX_REASON} caracteres.`);
    }

    // Cartão recorrente: cancela no provedor ANTES de apagar (fail closed). Se o banco falhar depois, a recorrência já está
    // cancelada e a exclusão pode ser repetida (cancelar de novo é tolerado, ver cancelCardRecurrence).
    const cardCancelled = await this.cancelCardRecurrence(tenant.subscription);

    const originalSlug = tenant.slug;
    await this.prisma.$transaction(
      async (tx) => {
        // Auditoria PRIMEIRO e na mesma transação: não existe exclusão sem trilha. Nunca dado pessoal aqui.
        await tx.adminAuditLog.create({
          data: {
            action: AUDIT_TENANT_PURGED,
            actor,
            tenantId,
            detail: [
              `slug=${originalSlug}`,
              status.deletable
                ? `acesso terminou em ${status.accessEndedAt?.toISOString().slice(0, 10)}${status.eligible ? `; prazo de ${DELETION_RETENTION_DAYS} dias cumprido` : ""}`
                : `negócio ainda com acesso (${status.billingStatus})`,
              ...(cardCancelled ? ['recorrência do cartão cancelada no provedor'] : []),
              ...(reason ? [`motivo: ${reason}`] : []),
            ].join("; "),
          },
        });

        for (const step of PURGE_STEPS) await step.run(tx, tenantId);

        // Fica só o esqueleto: sem nome, endereço, contato, logo, coordenadas nem listagem pública. O slug muda (o
        // endereço antigo deixa de existir e pode ser reutilizado).
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            name: "Negócio excluído",
            slug: `excluido-${tenantId}`,
            description: null,
            address: null,
            businessHours: null,
            logoUrl: null,
            accentColor: null,
            whatsappNumber: null,
            instagramUrl: null,
            city: null,
            neighborhood: null,
            latitude: null,
            longitude: null,
            priceRange: null,
            listedInMarketplace: false,
            suspendedReason: null,
            deletedAt: now,
          },
        });
      },
      // Muitas tabelas e, num negócio grande, muitas linhas: o padrão de 5 s não basta.
      { timeout: 120_000, maxWait: 10_000 },
    );

    // Arquivos enviados (logo, galeria, fotos de profissionais). Depois do commit: se falhar, o banco já está limpo e a
    // pasta pode ser removida na mão; o log avisa.
    await rm(join(UPLOADS_DIR, "tenants", tenantId), { recursive: true, force: true }).catch((error: unknown) => {
      this.logger.warn(`Dados excluídos, mas a pasta de arquivos do negócio ${tenantId} não foi removida: ${(error as Error).name}`);
    });

    this.logger.log(`Dados do negócio ${tenantId} excluídos por ${actor}.`);
    return { purged: true, slug: originalSlug };
  }

  // "Aguardar 90 dias": em vez de apagar agora, tira o acesso e deixa o negócio na fila da tela "Exclusão de dados", onde os
  // dados são apagados (por uma pessoa, nunca sozinho) quando o prazo de 90 dias cumprir. O acesso termina na hora pela
  // SUSPENSÃO (reversível: reativar cancela a espera), a recorrência do cartão é cancelada no provedor e a contagem parte
  // da suspensão. Negócio que já está sem acesso não é suspenso de novo: o prazo segue contando do fim do acesso dele.
  async scheduleDeletion(
    tenantId: string,
    input: { confirmSlug: string; reason?: string },
    actor: string,
    now: Date = new Date(),
  ): Promise<{ scheduled: true; slug: string; eligibleOn: Date }> {
    const tenant = await this.findTenant(tenantId);
    if (tenant.deletedAt) throw new ConflictException("Os dados deste negócio já foram excluídos.");
    if (input.confirmSlug.trim() !== tenant.slug) {
      throw new BadRequestException("A confirmação não confere com o endereço do negócio.");
    }
    const reason = input.reason?.trim() ?? "";
    if (reason.length > MAX_REASON || (reason.length > 0 && reason.length < MIN_REASON)) {
      throw new BadRequestException(`O motivo, quando informado, precisa ter de ${MIN_REASON} a ${MAX_REASON} caracteres.`);
    }

    const before = evaluateDeletion(tenant, tenant.subscription, now);
    const cardCancelled = await this.cancelCardRecurrence(tenant.subscription);
    const suspendNow = !before.deletable;

    const accessEndedAt = await this.prisma.$transaction(async (tx) => {
      if (suspendNow) {
        // `suspendedAt: null` e `deletedAt: null` no WHERE: não sobrescreve uma suspensão feita no meio do caminho.
        await tx.tenant.updateMany({
          where: { id: tenantId, deletedAt: null, suspendedAt: null },
          data: { suspendedAt: now, suspendedReason: SCHEDULED_SUSPENSION_REASON },
        });
      }
      const ended = suspendNow ? now : (before.accessEndedAt as Date);
      const eligibleOn = new Date(ended.getTime() + DELETION_RETENTION_DAYS * DAY_MS);
      await tx.adminAuditLog.create({
        data: {
          action: AUDIT_TENANT_DELETION_SCHEDULED,
          actor,
          tenantId,
          detail: [
            `slug=${tenant.slug}`,
            suspendNow ? "acesso encerrado agora (suspenso)" : `já sem acesso desde ${ended.toISOString().slice(0, 10)}`,
            `exclusão liberada em ${eligibleOn.toISOString().slice(0, 10)}`,
            ...(cardCancelled ? ["recorrência do cartão cancelada no provedor"] : []),
            ...(reason ? [`motivo: ${reason}`] : []),
          ].join("; "),
        },
      });
      return ended;
    });

    this.logger.log(`Exclusão do negócio ${tenantId} agendada (90 dias) por ${actor}.`);
    return { scheduled: true, slug: tenant.slug, eligibleOn: new Date(accessEndedAt.getTime() + DELETION_RETENTION_DAYS * DAY_MS) };
  }

  private hasCardRecurrence(subscription: SubscriptionForStatus): boolean {
    return !!subscription && !subscription.courtesy && subscription.method === BillingMethod.CARD_RECURRING && !!subscription.providerSubscriptionId;
  }

  // Devolve true se havia recorrência e ela foi cancelada (ou já estava cancelada no provedor).
  private async cancelCardRecurrence(subscription: SubscriptionForStatus): Promise<boolean> {
    if (!this.hasCardRecurrence(subscription)) return false;
    const providerId = subscription!.providerSubscriptionId as string;
    if (!this.mp.isConfigured()) {
      throw new ServiceUnavailableException(
        "Este negócio paga no cartão, mas o Mercado Pago não está configurado neste servidor para cancelar a cobrança. Nada foi excluído.",
      );
    }
    try {
      await this.mp.cancelPreapproval(providerId);
    } catch (error) {
      // Já estava cancelada (exclusão repetida)? Então segue; qualquer outra falha interrompe antes de apagar.
      const already = await this.mp
        .getPreapproval(providerId)
        .then((p) => p.status === "cancelled")
        .catch(() => false);
      if (!already) {
        this.logger.warn(`Cancelamento da recorrência ${providerId} falhou na exclusão do negócio: ${(error as Error).message}`);
        throw toBadGateway();
      }
    }
    return true;
  }

  private async findTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        trialEndsAt: true,
        suspendedAt: true,
        deletedAt: true,
        subscription: { select: SUBSCRIPTION_SELECT },
      },
    });
    // Mesmo 404 de negócio inexistente.
    if (!tenant) throw new NotFoundException("Negócio não encontrado.");
    return tenant;
  }
}

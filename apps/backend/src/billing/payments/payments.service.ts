import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  BillingAttemptStatus,
  BillingMethod,
  CouponKind,
  PlanTier,
  Prisma,
  SubscriptionStatus,
} from "@marquo/database";
import { PrismaService } from "../../prisma/prisma.service";
import { CouponsService } from "../../coupons/coupons.service";
import { couponState, isValidCouponCode, normalizeCouponCode } from "../../coupons/coupon.util";
import { billingBlockMessage } from "../billing-status.util";
import { PlanLimitService } from "../plan-limit.service";
import {
  MercadoPagoClient,
  MpPayment,
  MpPreapproval,
  PaymentProviderError,
  toBadGateway,
} from "./mercadopago.client";
import {
  addOneMonth,
  mpDateTime,
  nextPeriodStart,
  priceWithCoupon,
  reaisToCents,
  type PriceQuote,
} from "./pricing";

const PIX_VALIDITY_MS = 24 * 60 * 60 * 1000;
// Quem paga Pix só pode gerar a próxima cobrança perto do vencimento (evita pagar vários meses adiantado sem querer).
const RENEWAL_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
// Checkout de cartão abandonado: depois disto a tentativa expira e o uso do cupom volta.
const CARD_ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COUPON_ALREADY_USED_MESSAGE = "Este negócio já usou este cupom.";
export const COUPON_SIGNUP_ONLY_MESSAGE = "Este cupom vale só no cadastro de um novo negócio.";

interface CouponChoice {
  coupon: { id: string; code: string; kind: CouponKind; value: number };
  // Resgate que já existe (cupom digitado no cadastro, ainda não abatido) ou nenhum (uso novo a reservar).
  existingRedemptionId: string | null;
}

export interface QuoteResult extends PriceQuote {
  tier: PlanTier;
  planName: string;
  coupon: { code: string; kind: CouponKind; value: number; fromSignup: boolean } | null;
  couponError: string | null;
}

export interface AttemptView {
  id: string;
  method: BillingMethod;
  status: BillingAttemptStatus;
  chargeCents: number;
  listPriceCents: number;
  discountCents: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoClient,
    private readonly config: ConfigService,
    private readonly coupons: CouponsService,
    private readonly planLimit: PlanLimitService,
  ) {}

  isEnabled(): boolean {
    return this.mp.isConfigured();
  }

  private requireEnabled() {
    if (!this.mp.isConfigured()) {
      throw new ServiceUnavailableException("O pagamento online ainda não está disponível. Fale com a equipe do Marquo.");
    }
  }

  private notificationUrl(): string | null {
    const base = this.config.get<string>("BACKEND_PUBLIC_URL");
    return base ? `${base.replace(/\/+$/, "")}/webhooks/mercadopago` : null;
  }

  private frontendUrl(): string {
    return (this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  }

  private async lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:${tenantId}`})::bigint)`;
  }

  // ─────────────────────────────────────────────
  // Cupom e cotação
  // ─────────────────────────────────────────────

  // Só LÊ. Devolve qual cupom vale para este negócio nesta cobrança (digitado ou o do cadastro) ou o motivo de
  // não valer. Nada aqui reserva uso.
  private async chooseCoupon(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    rawCode: string | undefined,
  ): Promise<{ choice: CouponChoice | null; error: string | null }> {
    const code = rawCode?.trim() ? normalizeCouponCode(rawCode) : null;

    if (code) {
      if (!isValidCouponCode(code)) return { choice: null, error: "Cupom inválido ou expirado." };
      const coupon = await client.coupon.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          kind: true,
          value: true,
          isActive: true,
          validFrom: true,
          validUntil: true,
          maxRedemptions: true,
          redemptionCount: true,
        },
      });
      if (!coupon) return { choice: null, error: "Cupom inválido ou expirado." };
      if (coupon.kind === CouponKind.TRIAL_DAYS) return { choice: null, error: COUPON_SIGNUP_ONLY_MESSAGE };

      const redemption = await client.couponRedemption.findUnique({
        where: { couponId_tenantId: { couponId: coupon.id, tenantId } },
        select: { id: true, appliedAt: true },
      });
      if (redemption) {
        if (redemption.appliedAt) return { choice: null, error: COUPON_ALREADY_USED_MESSAGE };
        // Cupom do cadastro, ainda não abatido: vale (não consome novo uso).
        return { choice: { coupon, existingRedemptionId: redemption.id }, error: null };
      }
      if (couponState(coupon) !== "ACTIVE") return { choice: null, error: "Cupom inválido ou expirado." };
      return { choice: { coupon, existingRedemptionId: null }, error: null };
    }

    // Sem código digitado: usa o desconto que o negócio já resgatou no cadastro, se ainda não foi abatido.
    const pending = await client.couponRedemption.findFirst({
      where: {
        tenantId,
        appliedAt: null,
        coupon: { kind: { in: [CouponKind.PERCENT, CouponKind.FIXED_CENTS] } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, coupon: { select: { id: true, code: true, kind: true, value: true } } },
    });
    if (pending) return { choice: { coupon: pending.coupon, existingRedemptionId: pending.id }, error: null };
    return { choice: null, error: null };
  }

  async quote(tenantId: string, tier: PlanTier, couponCode?: string): Promise<QuoteResult> {
    const plan = await this.prisma.plan.findUnique({ where: { tier } });
    if (!plan) throw new NotFoundException("Plano não encontrado.");

    const { choice, error } = await this.chooseCoupon(this.prisma, tenantId, couponCode);
    const price = priceWithCoupon(plan.priceCents, choice?.coupon ?? null);
    return {
      tier,
      planName: plan.name,
      ...price,
      coupon: choice
        ? {
            code: choice.coupon.code,
            kind: choice.coupon.kind,
            value: choice.coupon.value,
            fromSignup: choice.existingRedemptionId !== null && !couponCode?.trim(),
          }
        : null,
      couponError: error,
    };
  }

  // ─────────────────────────────────────────────
  // Início de cobrança
  // ─────────────────────────────────────────────

  private assertCanStart(
    tenant: { suspendedAt: Date | null; subscription: Prisma.SubscriptionGetPayload<object> | null },
    method: BillingMethod,
  ) {
    if (tenant.suspendedAt) throw new ForbiddenException(billingBlockMessage("SUSPENDED"));

    const sub = tenant.subscription;
    // Sem assinatura, ou cortesia (pagar a substitui): livre.
    if (!sub || sub.courtesy) return;

    const now = Date.now();
    const periodEnd = sub.currentPeriodEnd?.getTime() ?? null;
    const active = sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.PAST_DUE;

    if (sub.method === BillingMethod.CARD_RECURRING && active) {
      const stillRunning = !sub.cancelAtPeriodEnd || periodEnd === null || periodEnd > now;
      if (stillRunning) {
        throw new ConflictException(
          sub.cancelAtPeriodEnd
            ? "Sua assinatura foi cancelada, mas o acesso segue até o fim do período já pago. Depois disso você pode assinar de novo."
            : "Você já tem uma assinatura no cartão ativa. Para trocar a forma de pagamento, cancele a atual primeiro.",
        );
      }
      return;
    }

    if (sub.method === BillingMethod.PIX_MONTHLY && periodEnd !== null && periodEnd - now > RENEWAL_WINDOW_MS) {
      throw new ConflictException(
        "Seu mês atual ainda está longe de terminar. Você poderá gerar o próximo Pix perto do vencimento.",
      );
    }
  }

  private async createAttempt(
    tenantId: string,
    tier: PlanTier,
    method: BillingMethod,
    couponCode: string | undefined,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { tier } });
    if (!plan) throw new NotFoundException("Plano não encontrado.");
    // O plano novo precisa comportar a equipe ativa (nada é desativado em silêncio por causa de uma cobrança).
    await this.planLimit.assertCanDowngrade(tenantId, tier);

    return this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: { subscription: true },
      });
      this.assertCanStart(tenant, method);

      const { choice, error } = await this.chooseCoupon(tx, tenantId, couponCode);
      if (error) throw new BadRequestException(error);

      let redemptionId: string | null = choice?.existingRedemptionId ?? null;
      let reserved = false;
      if (choice && redemptionId === null) {
        // Reserva atômica de um uso (mesma regra do cadastro); a unicidade (cupom, negócio) é do banco.
        await this.coupons.reserve(tx, choice.coupon.code);
        try {
          const created = await tx.couponRedemption.create({
            data: { couponId: choice.coupon.id, tenantId },
            select: { id: true },
          });
          redemptionId = created.id;
          reserved = true;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new ConflictException(COUPON_ALREADY_USED_MESSAGE);
          }
          throw e;
        }
      }

      const price = priceWithCoupon(plan.priceCents, choice?.coupon ?? null);
      const attempt = await tx.billingAttempt.create({
        data: {
          tenantId,
          planId: plan.id,
          method,
          listPriceCents: price.listPriceCents,
          discountCents: price.discountCents,
          chargeCents: price.chargeCents,
          couponRedemptionId: redemptionId,
          couponReserved: reserved,
          expiresAt: new Date(Date.now() + (method === BillingMethod.PIX_MONTHLY ? PIX_VALIDITY_MS : CARD_ATTEMPT_TTL_MS)),
        },
      });
      return { attempt, planName: plan.name };
    });
  }

  private async ownerEmail(tenantId: string, userId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { email: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    return user.email;
  }

  async startCard(tenantId: string, userId: string, tier: PlanTier, couponCode?: string) {
    this.requireEnabled();
    const email = await this.ownerEmail(tenantId, userId);
    const { attempt, planName } = await this.createAttempt(tenantId, tier, BillingMethod.CARD_RECURRING, couponCode);

    try {
      const preapproval = await this.mp.createPreapproval({
        reason: `Marquo - Plano ${planName}`,
        externalReference: attempt.id,
        payerEmail: email,
        amountCents: attempt.chargeCents,
        backUrl: `${this.frontendUrl()}/dashboard/plano?checkout=cartao&tentativa=${attempt.id}`,
        notificationUrl: this.notificationUrl(),
        idempotencyKey: attempt.id,
      });
      if (!preapproval.id || !preapproval.init_point) throw new PaymentProviderError(null, "Resposta sem link de pagamento");
      await this.prisma.billingAttempt.update({ where: { id: attempt.id }, data: { providerRef: String(preapproval.id) } });
      return { attemptId: attempt.id, url: preapproval.init_point, chargeCents: attempt.chargeCents };
    } catch (error) {
      await this.failAttempt(attempt.id);
      this.logger.warn(`Checkout de cartão falhou (tentativa ${attempt.id}): ${(error as Error).message}`);
      throw toBadGateway();
    }
  }

  async startPix(tenantId: string, userId: string, tier: PlanTier, couponCode?: string) {
    this.requireEnabled();
    const email = await this.ownerEmail(tenantId, userId);
    const { attempt, planName } = await this.createAttempt(tenantId, tier, BillingMethod.PIX_MONTHLY, couponCode);
    const expiresAt = attempt.expiresAt ?? new Date(Date.now() + PIX_VALIDITY_MS);

    try {
      const payment = await this.mp.createPixPayment({
        description: `Marquo - Plano ${planName} (1 mês)`,
        externalReference: attempt.id,
        payerEmail: email,
        amountCents: attempt.chargeCents,
        expiresAt: mpDateTime(expiresAt),
        notificationUrl: this.notificationUrl(),
        idempotencyKey: attempt.id,
      });
      const data = payment.point_of_interaction?.transaction_data;
      if (!payment.id || !data?.qr_code) throw new PaymentProviderError(null, "Resposta sem QR Code");
      await this.prisma.billingAttempt.update({ where: { id: attempt.id }, data: { providerRef: String(payment.id) } });
      return {
        attemptId: attempt.id,
        chargeCents: attempt.chargeCents,
        expiresAt,
        qrCode: data.qr_code,
        qrCodeBase64: data.qr_code_base64 ?? null,
        ticketUrl: data.ticket_url ?? null,
      };
    } catch (error) {
      await this.failAttempt(attempt.id);
      this.logger.warn(`Pix falhou (tentativa ${attempt.id}): ${(error as Error).message}`);
      throw toBadGateway();
    }
  }

  // ─────────────────────────────────────────────
  // Sincronização (sempre RELÊ o provedor; nunca confia no que veio do navegador ou do webhook)
  // ─────────────────────────────────────────────

  async getAttempt(tenantId: string, attemptId: string): Promise<AttemptView> {
    if (!UUID.test(attemptId)) throw new NotFoundException("Tentativa não encontrada.");
    // Posse no WHERE (nunca buscar por id e comparar depois).
    const attempt = await this.prisma.billingAttempt.findFirst({ where: { id: attemptId, tenantId } });
    if (!attempt) throw new NotFoundException("Tentativa não encontrada.");

    if (attempt.status === BillingAttemptStatus.PENDING && attempt.providerRef && this.mp.isConfigured()) {
      await this.syncAttemptSafely(attempt.id);
      const fresh = await this.prisma.billingAttempt.findFirstOrThrow({ where: { id: attemptId, tenantId } });
      return this.view(fresh);
    }
    return this.view(attempt);
  }

  private view(a: {
    id: string;
    method: BillingMethod;
    status: BillingAttemptStatus;
    chargeCents: number;
    listPriceCents: number;
    discountCents: number;
  }): AttemptView {
    return {
      id: a.id,
      method: a.method,
      status: a.status,
      chargeCents: a.chargeCents,
      listPriceCents: a.listPriceCents,
      discountCents: a.discountCents,
    };
  }

  // Relê o provedor e aplica. Erro do provedor não derruba quem chamou (a próxima leitura tenta de novo).
  private async syncAttemptSafely(attemptId: string): Promise<void> {
    try {
      await this.syncAttempt(attemptId);
    } catch (error) {
      this.logger.warn(`Sincronização da tentativa ${attemptId} falhou: ${(error as Error).message}`);
    }
  }

  async syncAttempt(attemptId: string): Promise<void> {
    const attempt = await this.prisma.billingAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt?.providerRef) return;

    if (attempt.method === BillingMethod.PIX_MONTHLY) {
      const payment = await this.mp.getPayment(attempt.providerRef);
      await this.applyPixPayment(attempt.id, payment);
    } else {
      const preapproval = await this.mp.getPreapproval(attempt.providerRef);
      await this.applyPreapproval(attempt.id, preapproval);
    }
  }

  // Sincroniza o cartão do negócio (botão "já paguei" / retorno do checkout).
  async syncCardForTenant(tenantId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { providerSubscriptionId: true } });
    const attempt = await this.prisma.billingAttempt.findFirst({
      where: {
        tenantId,
        method: BillingMethod.CARD_RECURRING,
        providerRef: sub?.providerSubscriptionId ?? { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    if (attempt) await this.syncAttemptSafely(attempt.id);
  }

  private async applyPixPayment(attemptId: string, payment: MpPayment): Promise<void> {
    let previousPreapproval: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.billingAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.method !== BillingMethod.PIX_MONTHLY) return;
      await this.lockTenant(tx, attempt.tenantId);
      // Relê dentro do lock: outro processo pode ter aplicado entre a leitura de fora e agora.
      const current = await tx.billingAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      if (current.status !== BillingAttemptStatus.PENDING) return;

      // O pagamento do provedor precisa ser DESTA tentativa e do valor que cobramos (nunca confiar só no id).
      if (String(payment.id) !== current.providerRef || payment.external_reference !== current.id) {
        this.logger.error(`Pagamento ${payment.id} não confere com a tentativa ${current.id}; ignorado.`);
        return;
      }

      if (payment.status === "approved") {
        if (payment.transaction_amount === undefined || reaisToCents(payment.transaction_amount) !== current.chargeCents) {
          this.logger.error(`Valor pago (${payment.transaction_amount}) difere do cobrado na tentativa ${current.id}; ignorado.`);
          return;
        }
        const existing = await tx.subscription.findUnique({ where: { tenantId: current.tenantId } });
        const keepsPix = existing && !existing.courtesy && existing.method === BillingMethod.PIX_MONTHLY;
        const start = nextPeriodStart(keepsPix ? existing.currentPeriodEnd : null);
        const end = addOneMonth(start);
        previousPreapproval = existing?.providerSubscriptionId ?? null;

        const values = {
          planId: current.planId,
          status: SubscriptionStatus.ACTIVE,
          courtesy: false,
          method: BillingMethod.PIX_MONTHLY,
          providerSubscriptionId: null,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
        };
        await tx.subscription.upsert({
          where: { tenantId: current.tenantId },
          create: { tenantId: current.tenantId, ...values },
          update: values,
        });
        await tx.billingAttempt.update({
          where: { id: current.id },
          data: { status: BillingAttemptStatus.APPROVED, approvedAt: new Date() },
        });
        if (current.couponRedemptionId) {
          await tx.couponRedemption.updateMany({
            where: { id: current.couponRedemptionId, appliedAt: null },
            data: { appliedAt: new Date() },
          });
        }
        return;
      }

      if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) {
        await this.releaseCoupon(tx, current);
        await tx.billingAttempt.update({ where: { id: current.id }, data: { status: BillingAttemptStatus.FAILED } });
      }
    });

    // Trocou de cartão para Pix: encerra a recorrência antiga para não cobrar nos dois (melhor esforço).
    if (previousPreapproval) {
      try {
        await this.mp.cancelPreapproval(previousPreapproval);
      } catch (error) {
        this.logger.error(`Não foi possível cancelar a assinatura ${previousPreapproval} ao migrar para Pix: ${(error as Error).message}`);
      }
    }
  }

  private async applyPreapproval(attemptId: string, preapproval: MpPreapproval): Promise<void> {
    let restorePrice: { providerRef: string; listPriceCents: number } | null = null;

    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.billingAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.method !== BillingMethod.CARD_RECURRING) return;
      await this.lockTenant(tx, attempt.tenantId);
      const current = await tx.billingAttempt.findUniqueOrThrow({ where: { id: attemptId } });

      if (String(preapproval.id) !== current.providerRef || preapproval.external_reference !== current.id) {
        this.logger.error(`Assinatura ${preapproval.id} não confere com a tentativa ${current.id}; ignorada.`);
        return;
      }

      const sub = await tx.subscription.findUnique({ where: { tenantId: current.tenantId } });
      const ownsSub = sub?.providerSubscriptionId === current.providerRef;
      const next = preapproval.next_payment_date ? new Date(preapproval.next_payment_date) : null;
      const nextValid = next && !Number.isNaN(next.getTime()) ? next : null;

      if (preapproval.status === "authorized") {
        // Se esta assinatura já é do negócio, o plano vigente é o da Subscription (o dono pode ter trocado de plano
        // depois da tentativa): a releitura nunca o regrava com o plano da tentativa original.
        const values = {
          planId: ownsSub ? sub.planId : current.planId,
          status: SubscriptionStatus.ACTIVE,
          courtesy: false,
          method: BillingMethod.CARD_RECURRING,
          providerSubscriptionId: current.providerRef,
          currentPeriodEnd: nextValid ?? (ownsSub ? sub.currentPeriodEnd : addOneMonth(new Date())),
          cancelAtPeriodEnd: false,
        };
        await tx.subscription.upsert({
          where: { tenantId: current.tenantId },
          create: { tenantId: current.tenantId, ...values },
          update: values,
        });
        if (current.status === BillingAttemptStatus.PENDING) {
          await tx.billingAttempt.update({
            where: { id: current.id },
            data: { status: BillingAttemptStatus.APPROVED, approvedAt: new Date() },
          });
          if (current.couponRedemptionId) {
            await tx.couponRedemption.updateMany({
              where: { id: current.couponRedemptionId, appliedAt: null },
              data: { appliedAt: new Date() },
            });
          }
        }
        // Com desconto na primeira cobrança, depois que ela saiu o valor volta ao preço cheio.
        const charged = preapproval.summarized?.charged_quantity ?? 0;
        const amountNow = preapproval.auto_recurring?.transaction_amount;
        // (Só se o plano ainda é o da tentativa: depois de uma troca de plano o valor certo é o do plano novo.)
        const samePlan = !ownsSub || sub.planId === current.planId;
        if (
          samePlan &&
          current.discountCents > 0 &&
          charged >= 1 &&
          amountNow !== undefined &&
          reaisToCents(amountNow) !== current.listPriceCents
        ) {
          restorePrice = { providerRef: current.providerRef as string, listPriceCents: current.listPriceCents };
        }
        return;
      }

      if (preapproval.status === "paused" && ownsSub) {
        await tx.subscription.update({
          where: { tenantId: current.tenantId },
          data: { status: SubscriptionStatus.PAST_DUE, ...(nextValid ? { currentPeriodEnd: nextValid } : {}) },
        });
        return;
      }

      if (preapproval.status === "cancelled") {
        if (ownsSub) {
          // Cancelada: o que já foi pago vale até o fim do período; depois disso o acesso termina.
          await tx.subscription.update({ where: { tenantId: current.tenantId }, data: { cancelAtPeriodEnd: true } });
        } else if (current.status === BillingAttemptStatus.PENDING) {
          await this.releaseCoupon(tx, current);
          await tx.billingAttempt.update({ where: { id: current.id }, data: { status: BillingAttemptStatus.FAILED } });
        }
      }
    });

    if (restorePrice) {
      const target = restorePrice as { providerRef: string; listPriceCents: number };
      try {
        await this.mp.updatePreapprovalAmount(target.providerRef, target.listPriceCents);
      } catch (error) {
        // A próxima sincronização tenta de novo. Fica no log para a equipe conferir se persistir.
        this.logger.error(`Não foi possível voltar ao preço cheio na assinatura ${target.providerRef}: ${(error as Error).message}`);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Troca de plano (assinatura paga ativa)
  // ─────────────────────────────────────────────

  // Vale NA HORA para o limite de profissionais; o valor novo é cobrado a partir da próxima cobrança (cartão) ou do
  // próximo Pix. Troca para um plano que não comporta a equipe ATIVA é recusada (409): nada é desativado em silêncio,
  // o dono é quem decide quem sai antes de reduzir o plano.
  async changePlan(tenantId: string, tier: PlanTier): Promise<{ planName: string; effective: string }> {
    const plan = await this.prisma.plan.findUnique({ where: { tier } });
    if (!plan) throw new NotFoundException("Plano não encontrado.");

    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub || sub.courtesy || !sub.method) {
      throw new ConflictException("Só é possível trocar de plano com uma assinatura paga ativa.");
    }
    if (sub.status !== SubscriptionStatus.ACTIVE || sub.cancelAtPeriodEnd) {
      throw new ConflictException(
        sub.cancelAtPeriodEnd
          ? "Sua assinatura está cancelada. Assine de novo para escolher outro plano."
          : "Regularize o pagamento antes de trocar de plano.",
      );
    }
    if (sub.planId === plan.id) throw new ConflictException("Este já é o seu plano.");
    if (sub.method === BillingMethod.PIX_MONTHLY && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= Date.now()) {
      throw new ConflictException("Seu mês terminou. Pague o Pix do próximo mês para escolher o plano.");
    }

    // A equipe ativa precisa caber no plano novo (mesma regra do checkout).
    await this.planLimit.assertCanDowngrade(tenantId, tier);

    if (sub.method === BillingMethod.CARD_RECURRING) {
      this.requireEnabled();
      if (!sub.providerSubscriptionId) throw new ConflictException("Assinatura sem vínculo com o provedor.");
      try {
        // Antes da 1ª cobrança a assinatura ainda está com o valor do cupom: trocar agora faria o valor errado valer.
        const preapproval = await this.mp.getPreapproval(sub.providerSubscriptionId);
        if ((preapproval.summarized?.charged_quantity ?? 0) < 1) {
          throw new ConflictException("Aguarde a primeira cobrança ser confirmada para trocar de plano.");
        }
        await this.mp.updatePreapprovalAmount(sub.providerSubscriptionId, plan.priceCents);
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        this.logger.warn(`Troca de plano (tenant ${tenantId}) falhou no provedor: ${(error as Error).message}`);
        throw toBadGateway();
      }
    }

    // O provedor já está com o valor novo: grava o plano. updateMany com o plano antigo no WHERE (duas trocas
    // simultâneas não se sobrescrevem; a perdedora recebe 409).
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      return tx.subscription.updateMany({
        where: { tenantId, planId: sub.planId, courtesy: false, status: SubscriptionStatus.ACTIVE },
        data: { planId: plan.id },
      });
    });
    if (updated.count !== 1) throw new ConflictException("O plano mudou enquanto você trocava. Tente de novo.");

    return {
      planName: plan.name,
      effective:
        sub.method === BillingMethod.CARD_RECURRING
          ? "O novo valor passa a valer na próxima cobrança."
          : "O novo valor vale a partir do próximo Pix.",
    };
  }

  // ─────────────────────────────────────────────
  // Cancelamento e expiração
  // ─────────────────────────────────────────────

  async cancel(tenantId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub || sub.courtesy) {
      throw new ConflictException("Não há uma assinatura paga para cancelar.");
    }
    if (sub.cancelAtPeriodEnd) return;

    if (sub.method === BillingMethod.CARD_RECURRING && sub.providerSubscriptionId) {
      this.requireEnabled();
      try {
        await this.mp.cancelPreapproval(sub.providerSubscriptionId);
      } catch (error) {
        this.logger.warn(`Cancelamento da assinatura ${sub.providerSubscriptionId} falhou: ${(error as Error).message}`);
        throw toBadGateway();
      }
    }
    // Cartão ou Pix: o que já foi pago vale até o fim do período (computeBillingStatus bloqueia depois).
    await this.prisma.subscription.updateMany({ where: { tenantId, courtesy: false }, data: { cancelAtPeriodEnd: true } });
  }

  private async failAttempt(attemptId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.billingAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.status !== BillingAttemptStatus.PENDING) return;
      await this.releaseCoupon(tx, attempt);
      await tx.billingAttempt.update({ where: { id: attemptId }, data: { status: BillingAttemptStatus.FAILED } });
    });
  }

  // Devolve o uso do cupom que ESTA tentativa consumiu (e só ele). Um resgate antigo, do cadastro, não é desfeito.
  private async releaseCoupon(
    tx: Prisma.TransactionClient,
    attempt: { id: string; couponReserved: boolean; couponRedemptionId: string | null },
  ): Promise<void> {
    if (!attempt.couponReserved || !attempt.couponRedemptionId) return;
    const redemption = await tx.couponRedemption.findUnique({
      where: { id: attempt.couponRedemptionId },
      select: { id: true, couponId: true, appliedAt: true },
    });
    if (redemption && redemption.appliedAt === null) {
      await tx.couponRedemption.delete({ where: { id: redemption.id } });
      await tx.$executeRaw`UPDATE "Coupon" SET "redemptionCount" = GREATEST("redemptionCount" - 1, 0), "updatedAt" = now() WHERE "id" = ${redemption.couponId}`;
    }
    await tx.billingAttempt.update({
      where: { id: attempt.id },
      data: { couponReserved: false, couponRedemptionId: null },
    });
  }

  // Todo mês de hora em hora: tentativa pendente vencida é relida no provedor (pode ter sido paga sem o
  // webhook chegar) e, se continua pendente, expira — e o uso do cupom volta.
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleAttempts(): Promise<void> {
    if (!this.mp.isConfigured()) return;
    const stale = await this.prisma.billingAttempt.findMany({
      where: { status: BillingAttemptStatus.PENDING, expiresAt: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const { id } of stale) {
      await this.syncAttemptSafely(id);
      await this.prisma.$transaction(async (tx) => {
        const attempt = await tx.billingAttempt.findUnique({ where: { id } });
        if (!attempt || attempt.status !== BillingAttemptStatus.PENDING) return;
        await this.releaseCoupon(tx, attempt);
        await tx.billingAttempt.update({ where: { id }, data: { status: BillingAttemptStatus.EXPIRED } });
      });
    }
    if (stale.length > 0) this.logger.log(`Tentativas de pagamento expiradas: ${stale.length}.`);
  }

  // ─────────────────────────────────────────────
  // Webhook
  // ─────────────────────────────────────────────

  // O corpo do webhook é só um AVISO ("algo mudou neste id"). Tudo é relido na API do provedor com o nosso token
  // e só então aplicado, então notificações repetidas, fora de ordem ou forjadas convergem para o estado real.
  async handleNotification(type: string, dataId: string): Promise<void> {
    if (!this.mp.isConfigured() || !dataId || dataId.length > 64) return;

    try {
      await this.processNotification(type, dataId);
    } catch (error) {
      // O provedor não conhece este id (notificação forjada, de outra conta ou de teste): não há o que reentregar,
      // então 200. Falha do provedor/rede: 503, para ele tentar de novo mais tarde.
      if (error instanceof PaymentProviderError && error.status === 404) {
        this.logger.warn(`Notificação ${type} para id desconhecido no provedor (${dataId}); ignorada.`);
        return;
      }
      if (error instanceof PaymentProviderError) {
        throw new ServiceUnavailableException("Provedor de pagamento indisponível.");
      }
      throw error;
    }
  }

  private async processNotification(type: string, dataId: string): Promise<void> {
    if (type === "payment") {
      const payment = await this.mp.getPayment(dataId);
      const attemptId = this.attemptIdFrom(payment.external_reference);
      if (attemptId) await this.syncAttempt(attemptId);
      return;
    }
    if (type === "subscription_preapproval") {
      const preapproval = await this.mp.getPreapproval(dataId);
      const attemptId = this.attemptIdFrom(preapproval.external_reference);
      if (attemptId) await this.syncAttempt(attemptId);
      return;
    }
    if (type === "subscription_authorized_payment") {
      const authorized = await this.mp.getAuthorizedPayment(dataId);
      if (!authorized.preapproval_id) return;
      const preapproval = await this.mp.getPreapproval(authorized.preapproval_id);
      const attemptId = this.attemptIdFrom(preapproval.external_reference);
      if (attemptId) await this.syncAttempt(attemptId);
    }
  }

  private attemptIdFrom(reference: string | undefined): string | null {
    return reference && UUID.test(reference) ? reference : null;
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  BillingAttemptKind,
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
import { isValidCnpj, normalizeCnpj } from "../../common/utils/cnpj.util";
import { isValidCpf, normalizeCpf } from "../../common/utils/cpf.util";
import {
  ASAAS_PAID_STATUSES,
  ASAAS_REVERSED_STATUSES,
  AsaasClient,
  AsaasPayment,
  AsaasSubscription,
  PaymentProviderError,
  toBadGateway,
} from "./asaas.client";
import {
  addOneMonth,
  asaasDate,
  nextPeriodStart,
  paidAmountMatches,
  parseAsaasDate,
  prorateUpgrade,
  priceWithCoupon,
  reaisToCents,
  type PriceQuote,
} from "./pricing";

const PIX_VALIDITY_MS = 24 * 60 * 60 * 1000;
// Quem paga Pix só pode gerar a próxima cobrança perto do vencimento (evita pagar vários meses adiantado sem querer).
const RENEWAL_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
// Checkout de cartão abandonado: depois disto a tentativa expira e o uso do cupom volta.
const CARD_ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;
// O checkout hospedado do Asaas aceita de 10 a 1440 minutos de validade.
const CHECKOUT_MINUTES_TO_EXPIRE = 1440;
// Cada tentativa cria um cliente (e uma cobrança ou checkout) na conta do Asaas. Sem teto, um dono autenticado poderia
// enchê-la de objetos e gastar a cota da API (25 mil requisições a cada 12 h, da conta inteira). Abandonar um checkout de
// cartão deixa a tentativa PENDENTE por até 48 h, então o teto conta só a última hora.
const MAX_PENDING_ATTEMPTS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
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

export interface PixIssued {
  attemptId: string;
  chargeCents: number;
  expiresAt: Date;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
}

// Resposta da troca de plano: ou já valeu (queda de plano / mesmo preço) ou exige pagar a diferença por Pix (upgrade).
export type ChangePlanResult =
  | { applied: true; planName: string; effective: string }
  | ({ applied: false; requiresPayment: true; planName: string } & PixIssued);

export interface ChangePlanQuote {
  tier: PlanTier;
  planName: string;
  // IMMEDIATE = vale na hora, sem cobrança agora; PAYMENT = paga a diferença por Pix e o plano muda ao confirmar.
  kind: "IMMEDIATE" | "PAYMENT";
  newPriceCents: number;
  currentPriceCents: number;
  chargeCents: number | null;
  remainingDays: number | null;
  effective: string;
}

export interface AttemptView {
  id: string;
  kind: BillingAttemptKind;
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
    private readonly asaas: AsaasClient,
    private readonly config: ConfigService,
    private readonly coupons: CouponsService,
    private readonly planLimit: PlanLimitService,
  ) {}

  isEnabled(): boolean {
    return this.asaas.isConfigured();
  }

  private requireEnabled() {
    if (!this.asaas.isConfigured()) {
      throw new ServiceUnavailableException("O pagamento online ainda não está disponível. Fale com a equipe do Marquo.");
    }
  }

  // Base do endereço de volta do checkout do cartão. O Asaas só aceita https público: em dev (FRONTEND_URL=http://localhost:3000)
  // o checkout falha com "O campo successUrl é inválido", então ASAAS_BACK_URL_BASE aponta para um túnel https do frontend.
  private backUrlBase(): string {
    const override = this.config.get<string>("ASAAS_BACK_URL_BASE");
    return (override ?? this.frontendUrl()).replace(/\/+$/, "");
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

      await this.assertPendingCap(tx, tenantId);

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

  // Quem paga: o dono, relido do banco com o tenant no WHERE (nome e e-mail nunca vêm do request).
  private async owner(tenantId: string, userId: string): Promise<{ name: string; email: string }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { name: true, email: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    return user;
  }

  // O Asaas só emite cobrança para cliente com CPF/CNPJ. O DTO já recusa documento inválido; o serviço repete a
  // conferência (o DTO não é a última linha) e manda ao provedor só os dígitos.
  private normalizeDocument(raw: string): string {
    if (isValidCpf(raw)) return normalizeCpf(raw);
    if (isValidCnpj(raw)) return normalizeCnpj(raw);
    throw new BadRequestException("CPF ou CNPJ inválido.");
  }

  // Cria no Asaas o cliente DESTA tentativa e grava o id: é a ligação entre o provedor e o negócio. O documento vai
  // direto ao provedor e não fica no nosso banco.
  private async createProviderCustomer(attemptId: string, owner: { name: string; email: string }, document: string) {
    const customer = await this.asaas.createCustomer({
      name: owner.name,
      email: owner.email,
      cpfCnpj: document,
      externalReference: attemptId,
    });
    if (!customer.id) throw new PaymentProviderError(null, "Resposta sem id de cliente");
    await this.prisma.billingAttempt.update({ where: { id: attemptId }, data: { providerCustomerId: customer.id } });
    return customer.id;
  }

  // Cartão: o dono vai para o checkout hospedado do Asaas e digita o cartão LÁ (nunca passa por aqui). Concluído, o
  // Asaas cria a assinatura mensal para o cliente que montamos, e é por esse cliente que ela volta a este negócio.
  async startCard(tenantId: string, userId: string, tier: PlanTier, cpfCnpj: string, couponCode?: string) {
    this.requireEnabled();
    const document = this.normalizeDocument(cpfCnpj);
    // Falha cedo e com motivo claro (em vez de criar tentativa/cliente e receber um 400 do provedor). Em produção o
    // FRONTEND_URL é https, então isto só aparece em desenvolvimento.
    const back = `${this.backUrlBase()}/dashboard/plano`;
    if (!back.startsWith("https://")) {
      throw new ServiceUnavailableException(
        "O checkout de cartão do Asaas exige um endereço https público de retorno. Em desenvolvimento, defina ASAAS_BACK_URL_BASE com um túnel https do frontend, ou teste com Pix.",
      );
    }
    const owner = await this.owner(tenantId, userId);
    const { attempt, planName } = await this.createAttempt(tenantId, tier, BillingMethod.CARD_RECURRING, couponCode);

    try {
      const customerId = await this.createProviderCustomer(attempt.id, owner, document);
      const checkout = await this.asaas.createCheckout({
        customerId,
        itemName: `Marquo - Plano ${planName}`,
        itemDescription: `Assinatura mensal do plano ${planName}`,
        amountCents: attempt.chargeCents,
        // Primeira cobrança hoje (o cartão é cobrado ao concluir o checkout); as seguintes, todo mês.
        nextDueDate: `${asaasDate(new Date())} 23:59:59`,
        minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
        successUrl: `${back}?checkout=cartao&tentativa=${attempt.id}`,
        cancelUrl: back,
        expiredUrl: back,
      });
      if (!checkout.id) throw new PaymentProviderError(null, "Resposta sem checkout");
      await this.prisma.billingAttempt.update({ where: { id: attempt.id }, data: { providerRef: String(checkout.id) } });
      return { attemptId: attempt.id, url: this.asaas.checkoutUrl(checkout), chargeCents: attempt.chargeCents };
    } catch (error) {
      await this.failAttempt(attempt.id);
      this.logger.warn(`Checkout de cartão falhou (tentativa ${attempt.id}): ${(error as Error).message}`);
      throw toBadGateway();
    }
  }

  async startPix(tenantId: string, userId: string, tier: PlanTier, cpfCnpj: string, couponCode?: string) {
    this.requireEnabled();
    const document = this.normalizeDocument(cpfCnpj);
    const owner = await this.owner(tenantId, userId);
    const { attempt, planName } = await this.createAttempt(tenantId, tier, BillingMethod.PIX_MONTHLY, couponCode);
    return this.issuePix(attempt, `Marquo - Plano ${planName} (1 mês)`, (id) => this.createProviderCustomer(id, owner, document));
  }

  // Cria no Asaas a cobrança Pix de UMA tentativa (assinatura mensal ou diferença de upgrade) e devolve o QR Code. O valor
  // cobrado é o da tentativa, que o servidor calculou. Qualquer falha encerra a tentativa e remove a cobrança do provedor.
  private async issuePix(
    attempt: { id: string; chargeCents: number; expiresAt: Date | null },
    description: string,
    customer: (attemptId: string) => Promise<string>,
  ): Promise<PixIssued> {
    const expiresAt = attempt.expiresAt ?? new Date(Date.now() + PIX_VALIDITY_MS);
    let paymentId: string | null = null;

    try {
      const customerId = await customer(attempt.id);
      const payment = await this.asaas.createPixPayment({
        customerId,
        amountCents: attempt.chargeCents,
        dueDate: asaasDate(new Date()),
        description,
        externalReference: attempt.id,
      });
      if (!payment.id) throw new PaymentProviderError(null, "Resposta sem cobrança");
      paymentId = String(payment.id);
      await this.prisma.billingAttempt.update({ where: { id: attempt.id }, data: { providerRef: paymentId } });

      const qr = await this.asaas.getPixQrCode(paymentId);
      if (!qr.payload) throw new PaymentProviderError(null, "Resposta sem QR Code");
      return {
        attemptId: attempt.id,
        chargeCents: attempt.chargeCents,
        expiresAt,
        qrCode: qr.payload,
        qrCodeBase64: qr.encodedImage ?? null,
        ticketUrl: null,
      };
    } catch (error) {
      await this.failAttempt(attempt.id);
      // Cobrança criada mas QR indisponível: tira do ar, senão ficaria uma cobrança paga sem tentativa viva.
      if (paymentId) await this.deletePaymentQuietly(paymentId);
      this.logger.warn(`Pix falhou (tentativa ${attempt.id}): ${(error as Error).message}`);
      throw toBadGateway();
    }
  }

  private async deletePaymentQuietly(paymentId: string): Promise<void> {
    try {
      await this.asaas.deletePayment(paymentId);
    } catch (error) {
      this.logger.error(`Não foi possível remover a cobrança ${paymentId} no provedor: ${(error as Error).message}`);
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

    if (attempt.status === BillingAttemptStatus.PENDING && attempt.providerRef && this.asaas.isConfigured()) {
      await this.syncAttemptSafely(attempt.id);
      const fresh = await this.prisma.billingAttempt.findFirstOrThrow({ where: { id: attemptId, tenantId } });
      return this.view(fresh);
    }
    return this.view(attempt);
  }

  private view(a: {
    id: string;
    kind: BillingAttemptKind;
    method: BillingMethod;
    status: BillingAttemptStatus;
    chargeCents: number;
    listPriceCents: number;
    discountCents: number;
  }): AttemptView {
    return {
      id: a.id,
      kind: a.kind,
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
      const payment = await this.asaas.getPayment(attempt.providerRef);
      await this.applyPixPayment(attempt.id, payment);
      return;
    }
    // Cartão: o checkout cria a assinatura para o cliente desta tentativa. Sem assinatura ainda = o dono não terminou.
    if (!attempt.providerCustomerId) return;
    const subscriptions = await this.asaas.listSubscriptionsByCustomer(attempt.providerCustomerId);
    const subscription = subscriptions.find((s) => !s.deleted && s.status === "ACTIVE") ?? subscriptions.find((s) => !s.deleted);
    if (!subscription) {
      // Todas removidas: se esta tentativa é dona de uma assinatura que foi encerrada, trata como cancelada.
      const removed = subscriptions.find((s) => s.deleted);
      if (removed) await this.applyCardSubscription(attempt.id, removed, []);
      return;
    }
    const payments = await this.asaas.listSubscriptionPayments(subscription.id);
    await this.applyCardSubscription(attempt.id, subscription, payments);
  }

  // Sincroniza o cartão do negócio (botão "já paguei" / retorno do checkout): as tentativas de cartão mais recentes.
  async syncCardForTenant(tenantId: string): Promise<void> {
    const attempts = await this.prisma.billingAttempt.findMany({
      where: { tenantId, method: BillingMethod.CARD_RECURRING, providerCustomerId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true },
    });
    for (const { id } of attempts) await this.syncAttemptSafely(id);
  }

  private async applyPixPayment(attemptId: string, payment: AsaasPayment): Promise<void> {
    let previousSubscription: string | null = null;
    // Upgrade pago de quem assina no cartão: o valor mensal da assinatura no provedor passa ao do plano novo.
    let upgradeValue: { subscriptionId: string; priceCents: number } | null = null;

    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.billingAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.method !== BillingMethod.PIX_MONTHLY) return;
      await this.lockTenant(tx, attempt.tenantId);
      // Relê dentro do lock: outro processo pode ter aplicado entre a leitura de fora e agora.
      const current = await tx.billingAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      if (current.status !== BillingAttemptStatus.PENDING) return;

      // A cobrança do provedor precisa ser DESTA tentativa e do valor que cobramos (nunca confiar só no id).
      if (String(payment.id) !== current.providerRef || payment.externalReference !== current.id) {
        this.logger.error(`Cobrança ${payment.id} não confere com a tentativa ${current.id}; ignorada.`);
        return;
      }

      if ((ASAAS_PAID_STATUSES as readonly string[]).includes(payment.status)) {
        if (!paidAmountMatches(payment.value, current.chargeCents)) {
          this.logger.error(`Valor pago (${payment.value}) difere do cobrado na tentativa ${current.id}; ignorado.`);
          return;
        }
        // Diferença de upgrade: NÃO é um mês novo. Só troca o plano (se ainda for seguro) e mantém período e forma de pagamento.
        if (current.kind === BillingAttemptKind.PLAN_UPGRADE) {
          upgradeValue = await this.applyUpgradePayment(tx, current);
          return;
        }
        const existing = await tx.subscription.findUnique({ where: { tenantId: current.tenantId } });
        const keepsPix = existing && !existing.courtesy && existing.method === BillingMethod.PIX_MONTHLY;
        const start = nextPeriodStart(keepsPix ? existing.currentPeriodEnd : null);
        const end = addOneMonth(start);
        previousSubscription = existing?.providerSubscriptionId ?? null;

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

      if (payment.deleted || (ASAAS_REVERSED_STATUSES as readonly string[]).includes(payment.status)) {
        await this.releaseCoupon(tx, current);
        await tx.billingAttempt.update({ where: { id: current.id }, data: { status: BillingAttemptStatus.FAILED } });
      }
    });

    if (upgradeValue) {
      const target = upgradeValue as { subscriptionId: string; priceCents: number };
      try {
        await this.asaas.updateSubscriptionValue(target.subscriptionId, target.priceCents);
      } catch (error) {
        // O plano já foi trocado (o dinheiro entrou). A próxima leitura da assinatura corrige o valor mensal.
        this.logger.error(`Não foi possível subir o valor da assinatura ${target.subscriptionId} após o upgrade: ${(error as Error).message}`);
      }
    }

    // Trocou de cartão para Pix: encerra a recorrência antiga para não cobrar nos dois (melhor esforço).
    if (previousSubscription) {
      try {
        await this.asaas.deleteSubscription(previousSubscription);
      } catch (error) {
        this.logger.error(`Não foi possível cancelar a assinatura ${previousSubscription} ao migrar para Pix: ${(error as Error).message}`);
      }
    }
  }

  // O Pix da diferença foi confirmado (valor e referência já conferidos). Só agora o plano sobe, e só se o negócio ainda está
  // como estava ao pedir a troca: mesmo plano de origem, assinatura paga viva e plano novo realmente mais caro. Se algo mudou
  // no meio (cancelou, trocou de plano por outro caminho), o dinheiro fica registrado, nada é trocado às cegas e vai para o
  // log para a equipe revisar. Devolve o novo valor mensal a gravar no provedor quando a assinatura é de cartão.
  private async applyUpgradePayment(
    tx: Prisma.TransactionClient,
    attempt: { id: string; tenantId: string; planId: string; fromPlanId: string | null },
  ): Promise<{ subscriptionId: string; priceCents: number } | null> {
    const sub = await tx.subscription.findUnique({ where: { tenantId: attempt.tenantId } });
    const target = await tx.plan.findUnique({ where: { id: attempt.planId } });
    const from = sub ? await tx.plan.findUnique({ where: { id: sub.planId } }) : null;
    const alive = sub?.status === SubscriptionStatus.ACTIVE || sub?.status === SubscriptionStatus.PAST_DUE;
    const safe =
      !!sub &&
      !!target &&
      !!from &&
      !sub.courtesy &&
      !!sub.method &&
      alive &&
      !sub.cancelAtPeriodEnd &&
      sub.planId === attempt.fromPlanId &&
      target.priceCents > from.priceCents;

    await tx.billingAttempt.update({
      where: { id: attempt.id },
      data: { status: BillingAttemptStatus.APPROVED, approvedAt: new Date() },
    });

    if (!safe || !sub || !target) {
      this.logger.error(
        `Pagamento de upgrade recebido (tentativa ${attempt.id}), mas o negócio mudou desde o pedido: plano NÃO alterado. Revisar.`,
      );
      return null;
    }
    const changed = await tx.subscription.updateMany({
      where: { tenantId: attempt.tenantId, planId: attempt.fromPlanId as string, courtesy: false },
      data: { planId: target.id },
    });
    if (changed.count !== 1) {
      this.logger.error(`Pagamento de upgrade recebido (tentativa ${attempt.id}), mas o plano mudou em paralelo. Revisar.`);
      return null;
    }
    return sub.method === BillingMethod.CARD_RECURRING && sub.providerSubscriptionId
      ? { subscriptionId: sub.providerSubscriptionId, priceCents: target.priceCents }
      : null;
  }

  // Aplica o estado RELIDO da assinatura (e das cobranças dela) no negócio. A assinatura do Asaas já nasce ACTIVE ao
  // concluir o checkout, então "pago" é decidido pelas COBRANÇAS: a primeira confirmada ativa o acesso; cada mês
  // seguinte confirmado renova o período; cobrança vencida sem pagamento põe em atraso.
  private async applyCardSubscription(
    attemptId: string,
    subscription: AsaasSubscription,
    payments: AsaasPayment[],
  ): Promise<void> {
    let restorePrice: { subscriptionId: string; listPriceCents: number } | null = null;

    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.billingAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.method !== BillingMethod.CARD_RECURRING) return;
      await this.lockTenant(tx, attempt.tenantId);
      const current = await tx.billingAttempt.findUniqueOrThrow({ where: { id: attemptId } });

      // A assinatura precisa ser do cliente que criamos para ESTA tentativa (nunca de outro negócio).
      if (!current.providerCustomerId || subscription.customer !== current.providerCustomerId) {
        this.logger.error(`Assinatura ${subscription.id} não confere com a tentativa ${current.id}; ignorada.`);
        return;
      }

      const sub = await tx.subscription.findUnique({ where: { tenantId: current.tenantId } });
      const ownsSub = sub?.providerSubscriptionId === subscription.id;
      // Tentativa já encerrada (falhou/expirou) e que nunca virou a assinatura do negócio: nada a aplicar.
      if (current.status !== BillingAttemptStatus.PENDING && !ownsSub) return;

      const live = payments.filter((p) => !p.deleted);
      const paid = live
        .filter((p) => (ASAAS_PAID_STATUSES as readonly string[]).includes(p.status))
        .sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""));

      if (subscription.deleted || subscription.status !== "ACTIVE") {
        if (ownsSub) {
          // Encerrada: o que já foi pago vale até o fim do período; depois disso o acesso termina.
          await tx.subscription.update({ where: { tenantId: current.tenantId }, data: { cancelAtPeriodEnd: true } });
        } else if (current.status === BillingAttemptStatus.PENDING && paid.length === 0) {
          await this.releaseCoupon(tx, current);
          await tx.billingAttempt.update({ where: { id: current.id }, data: { status: BillingAttemptStatus.FAILED } });
        }
        return;
      }

      if (paid.length === 0) {
        // Ainda sem pagamento confirmado. Se já era assinante e a cobrança do mês venceu, fica em atraso.
        if (ownsSub && live.some((p) => p.status === "OVERDUE")) {
          await tx.subscription.update({ where: { tenantId: current.tenantId }, data: { status: SubscriptionStatus.PAST_DUE } });
        }
        return;
      }

      // Primeira ativação: a cobrança paga precisa ter o valor que cobramos (nunca confiar só no que o provedor diz).
      if (!ownsSub) {
        const first = paid[paid.length - 1];
        if (!paidAmountMatches(first.value, current.chargeCents)) {
          this.logger.error(`Valor pago (${first.value}) difere do cobrado na tentativa ${current.id}; ignorado.`);
          return;
        }
      }

      // O período vai até um mês depois do vencimento da cobrança paga mais recente.
      const latestDue = parseAsaasDate(paid[0].dueDate);
      const end = addOneMonth(latestDue ?? new Date());
      const values = {
        // Se esta assinatura já é do negócio, o plano vigente é o da Subscription (o dono pode ter trocado de plano
        // depois da tentativa): a releitura nunca o regrava com o plano da tentativa original.
        planId: ownsSub ? sub.planId : current.planId,
        status: SubscriptionStatus.ACTIVE,
        courtesy: false,
        method: BillingMethod.CARD_RECURRING,
        providerSubscriptionId: subscription.id,
        currentPeriodEnd: ownsSub && sub.currentPeriodEnd && sub.currentPeriodEnd > end ? sub.currentPeriodEnd : end,
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

      // Com desconto na primeira cobrança, depois que ela saiu o valor volta ao preço cheio (só se o plano ainda é o
      // da tentativa: depois de uma troca de plano o valor certo é o do plano novo).
      const samePlan = !ownsSub || sub.planId === current.planId;
      if (
        samePlan &&
        current.discountCents > 0 &&
        subscription.value !== undefined &&
        reaisToCents(subscription.value) !== current.listPriceCents
      ) {
        restorePrice = { subscriptionId: subscription.id, listPriceCents: current.listPriceCents };
      } else if (ownsSub) {
        // Upgrade pago cujo aumento do valor mensal falhou no provedor: o plano já é o novo, mas a assinatura segue cobrando o
        // valor antigo. Corrige SÓ para cima e SÓ até o preço combinado no upgrade (nunca reajusta quem não trocou de plano).
        const upgrade = await tx.billingAttempt.findFirst({
          where: { tenantId: current.tenantId, kind: BillingAttemptKind.PLAN_UPGRADE, status: BillingAttemptStatus.APPROVED, planId: sub.planId },
          orderBy: { approvedAt: "desc" },
          select: { listPriceCents: true },
        });
        if (upgrade && typeof subscription.value === "number" && reaisToCents(subscription.value) < upgrade.listPriceCents) {
          restorePrice = { subscriptionId: subscription.id, listPriceCents: upgrade.listPriceCents };
        }
      }
    });

    if (restorePrice) {
      const target = restorePrice as { subscriptionId: string; listPriceCents: number };
      try {
        await this.asaas.updateSubscriptionValue(target.subscriptionId, target.listPriceCents);
      } catch (error) {
        // A próxima sincronização tenta de novo. Fica no log para a equipe conferir se persistir (o Asaas só permite
        // mudar o valor de assinatura de cartão com a tokenização habilitada na conta).
        this.logger.error(`Não foi possível voltar ao preço cheio na assinatura ${target.subscriptionId}: ${(error as Error).message}`);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Troca de plano (assinatura paga ativa)
  // ─────────────────────────────────────────────

  // PLANO MAIS CARO (upgrade): paga a diferença PROPORCIONAL ao que falta do período, por Pix (vale para quem paga por cartão
  // ou por Pix; o checkout hospedado não guarda o cartão para uma cobrança avulsa). O plano só sobe quando o Asaas confirma
  // o pagamento, nunca por pedido do cliente. Valor, dias restantes e plano de origem são SEMPRE derivados no servidor.
  // PLANO MAIS BARATO (ou mesmo preço): vale na hora, sem reembolso, e o novo valor é cobrado a partir da próxima cobrança; a
  // equipe ativa precisa caber no plano novo (409 com os números, nada é desativado em silêncio).
  private async changeContext(tenantId: string, tier: PlanTier) {
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
    const current = await this.prisma.plan.findUnique({ where: { id: sub.planId } });
    if (!current) throw new ConflictException("Não foi possível identificar o seu plano atual.");

    return { plan, sub, current, upgrade: plan.priceCents > current.priceCents };
  }

  private effectiveText(method: BillingMethod): string {
    return method === BillingMethod.CARD_RECURRING
      ? "O novo valor passa a valer na próxima cobrança."
      : "O novo valor vale a partir do próximo Pix.";
  }

  // Prévia do que a troca faz e QUANTO custa agora. Não reserva nada nem cria objeto no provedor.
  async quoteChangePlan(tenantId: string, tier: PlanTier): Promise<ChangePlanQuote> {
    const { plan, sub, current, upgrade } = await this.changeContext(tenantId, tier);
    const base = { tier, planName: plan.name, newPriceCents: plan.priceCents, currentPriceCents: current.priceCents };

    if (!upgrade) {
      // Mesma regra do pedido: se a equipe não couber, a prévia já avisa (com os números).
      await this.planLimit.assertCanDowngrade(tenantId, tier);
      return { ...base, kind: "IMMEDIATE", chargeCents: null, remainingDays: null, effective: this.effectiveText(sub.method as BillingMethod) };
    }
    if (!sub.currentPeriodEnd) throw new ConflictException("Não foi possível calcular a diferença do seu período.");
    const charge = prorateUpgrade(current.priceCents, plan.priceCents, sub.currentPeriodEnd);
    return {
      ...base,
      kind: "PAYMENT",
      chargeCents: charge.chargeCents,
      remainingDays: charge.remainingDays,
      effective: "O plano novo vale assim que o Pix for confirmado. O valor cheio passa a ser cobrado a partir do próximo ciclo.",
    };
  }

  async changePlan(
    tenantId: string,
    tier: PlanTier,
    ctx?: { userId?: string; cpfCnpj?: string },
  ): Promise<ChangePlanResult> {
    // Um pedido novo substitui o anterior ainda em aberto: o Pix antigo é lido (se já foi pago, credita) e, se não, removido
    // no provedor para não poder ser pago depois.
    await this.settlePendingUpgrades(tenantId);

    const context = await this.changeContext(tenantId, tier);
    if (context.upgrade) return this.startUpgrade(tenantId, context, ctx);
    return this.applyImmediateChange(tenantId, tier, context);
  }

  private async applyImmediateChange(
    tenantId: string,
    tier: PlanTier,
    { plan, sub }: { plan: { id: string; name: string; priceCents: number }; sub: { planId: string; method: BillingMethod | null; providerSubscriptionId: string | null } },
  ): Promise<ChangePlanResult> {
    // A equipe ativa precisa caber no plano novo (mesma regra do checkout).
    await this.planLimit.assertCanDowngrade(tenantId, tier);

    if (sub.method === BillingMethod.CARD_RECURRING) {
      this.requireEnabled();
      if (!sub.providerSubscriptionId) throw new ConflictException("Assinatura sem vínculo com o provedor.");
      try {
        await this.assertFirstChargeConfirmed(sub.providerSubscriptionId);
        await this.asaas.updateSubscriptionValue(sub.providerSubscriptionId, plan.priceCents);
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

    return { applied: true, planName: plan.name, effective: this.effectiveText(sub.method as BillingMethod) };
  }

  // Antes da 1ª cobrança confirmada a assinatura ainda está com o valor do cupom: trocar agora faria o valor errado valer.
  private async assertFirstChargeConfirmed(providerSubscriptionId: string): Promise<void> {
    const payments = await this.asaas.listSubscriptionPayments(providerSubscriptionId);
    const charged = payments.some((p) => !p.deleted && (ASAAS_PAID_STATUSES as readonly string[]).includes(p.status));
    if (!charged) throw new ConflictException("Aguarde a primeira cobrança ser confirmada para trocar de plano.");
  }

  private async startUpgrade(
    tenantId: string,
    { plan, sub, current }: Awaited<ReturnType<PaymentsService["changeContext"]>>,
    ctx?: { userId?: string; cpfCnpj?: string },
  ): Promise<ChangePlanResult> {
    this.requireEnabled();
    if (!sub.currentPeriodEnd) throw new ConflictException("Não foi possível calcular a diferença do seu período.");
    const charge = prorateUpgrade(current.priceCents, plan.priceCents, sub.currentPeriodEnd);

    if (sub.method === BillingMethod.CARD_RECURRING) {
      if (!sub.providerSubscriptionId) throw new ConflictException("Assinatura sem vínculo com o provedor.");
      try {
        await this.assertFirstChargeConfirmed(sub.providerSubscriptionId);
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        this.logger.warn(`Troca de plano (tenant ${tenantId}) falhou no provedor: ${(error as Error).message}`);
        throw toBadGateway();
      }
    }

    // Quem paga já é cliente no Asaas (criado no 1º pagamento, com o documento): reaproveita, sem pedir CPF/CNPJ de novo.
    // Só sem cliente conhecido o documento é exigido, e como sempre vai direto ao provedor.
    const known = await this.prisma.billingAttempt.findFirst({
      where: { tenantId, status: BillingAttemptStatus.APPROVED, providerCustomerId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { providerCustomerId: true },
    });
    let owner: { name: string; email: string } | null = null;
    let document: string | null = null;
    if (!known?.providerCustomerId) {
      if (!ctx?.cpfCnpj || !ctx.userId) throw new BadRequestException("Informe o CPF ou CNPJ de quem vai pagar.");
      document = this.normalizeDocument(ctx.cpfCnpj);
      owner = await this.owner(tenantId, ctx.userId);
    }

    const attempt = await this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      // Relê sob o lock: o negócio não pode ter trocado de plano nem cancelado entre a prévia e agora.
      const fresh = await tx.subscription.findUnique({ where: { tenantId } });
      if (!fresh || fresh.planId !== sub.planId || fresh.courtesy || fresh.cancelAtPeriodEnd || fresh.status !== SubscriptionStatus.ACTIVE) {
        throw new ConflictException("Sua assinatura mudou enquanto você trocava de plano. Tente de novo.");
      }
      await this.assertPendingCap(tx, tenantId);
      // `listPriceCents` guarda o preço mensal combinado do plano novo (o que a assinatura passa a cobrar); `chargeCents` é só
      // a diferença proporcional cobrada agora.
      return tx.billingAttempt.create({
        data: {
          tenantId,
          planId: plan.id,
          fromPlanId: sub.planId,
          kind: BillingAttemptKind.PLAN_UPGRADE,
          method: BillingMethod.PIX_MONTHLY,
          listPriceCents: plan.priceCents,
          discountCents: 0,
          chargeCents: charge.chargeCents,
          expiresAt: new Date(Date.now() + PIX_VALIDITY_MS),
        },
      });
    });

    const pix = await this.issuePix(attempt, `Marquo - troca para o plano ${plan.name} (diferença proporcional)`, async (attemptId) => {
      if (known?.providerCustomerId) {
        await this.prisma.billingAttempt.update({ where: { id: attemptId }, data: { providerCustomerId: known.providerCustomerId } });
        return known.providerCustomerId;
      }
      return this.createProviderCustomer(attemptId, owner as { name: string; email: string }, document as string);
    });
    return { applied: false, requiresPayment: true, planName: plan.name, ...pix };
  }

  // Cada tentativa cria objetos na conta do Asaas (cota global de API): teto de tentativas em aberto na última hora.
  private async assertPendingCap(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const pendingRecently = await tx.billingAttempt.count({
      where: { tenantId, status: BillingAttemptStatus.PENDING, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (pendingRecently >= MAX_PENDING_ATTEMPTS_PER_HOUR) {
      throw new HttpException(
        "Há tentativas de pagamento demais em aberto. Conclua uma delas ou aguarde alguns minutos.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Encerra os upgrades em aberto do negócio (um pedido novo substitui o anterior). Lê o provedor ANTES: se o Pix antigo já
  // foi pago, credita; se não, a cobrança é removida no Asaas para não poder ser paga depois sem tentativa viva.
  private async settlePendingUpgrades(tenantId: string): Promise<void> {
    if (!this.asaas.isConfigured()) return;
    const pending = await this.prisma.billingAttempt.findMany({
      where: { tenantId, kind: BillingAttemptKind.PLAN_UPGRADE, status: BillingAttemptStatus.PENDING },
      select: { id: true },
      take: 20,
    });
    for (const { id } of pending) {
      await this.syncAttemptSafely(id);
      let ref: string | null = null;
      await this.prisma.$transaction(async (tx) => {
        const attempt = await tx.billingAttempt.findUnique({ where: { id } });
        if (!attempt || attempt.status !== BillingAttemptStatus.PENDING) return;
        await tx.billingAttempt.update({ where: { id }, data: { status: BillingAttemptStatus.EXPIRED } });
        ref = attempt.providerRef;
      });
      if (ref) await this.deletePaymentQuietly(ref);
    }
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
        await this.asaas.deleteSubscription(sub.providerSubscriptionId);
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
  // webhook chegar) e, se continua pendente, expira — e o uso do cupom volta. O Pix expirado é removido no provedor
  // para não poder ser pago depois, quando já não haveria tentativa viva para creditá-lo.
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleAttempts(): Promise<void> {
    if (!this.asaas.isConfigured()) return;
    const stale = await this.prisma.billingAttempt.findMany({
      where: { status: BillingAttemptStatus.PENDING, expiresAt: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const { id } of stale) {
      await this.syncAttemptSafely(id);
      let expiredPixRef: string | null = null;
      await this.prisma.$transaction(async (tx) => {
        const attempt = await tx.billingAttempt.findUnique({ where: { id } });
        if (!attempt || attempt.status !== BillingAttemptStatus.PENDING) return;
        await this.releaseCoupon(tx, attempt);
        await tx.billingAttempt.update({ where: { id }, data: { status: BillingAttemptStatus.EXPIRED } });
        if (attempt.method === BillingMethod.PIX_MONTHLY) expiredPixRef = attempt.providerRef;
      });
      if (expiredPixRef) await this.deletePaymentQuietly(expiredPixRef);
    }
    if (stale.length > 0) this.logger.log(`Tentativas de pagamento expiradas: ${stale.length}.`);
  }

  // ─────────────────────────────────────────────
  // Webhook
  // ─────────────────────────────────────────────

  // O corpo do webhook é só um AVISO ("algo mudou neste id"). Tudo é relido na API do provedor com a nossa chave e só
  // então aplicado, então notificações repetidas, fora de ordem ou forjadas convergem para o estado real.
  // `kind`: "payment" | "subscription" | "checkout" (o objeto que veio no aviso).
  async handleNotification(kind: string, dataId: string): Promise<void> {
    if (!this.asaas.isConfigured() || !dataId || dataId.length > 64) return;

    try {
      await this.processNotification(kind, dataId);
    } catch (error) {
      // O provedor não conhece este id (notificação forjada, de outra conta ou de teste): não há o que reentregar,
      // então 200. Falha do provedor/rede: 503, para ele tentar de novo mais tarde.
      if (error instanceof PaymentProviderError && error.status === 404) {
        this.logger.warn(`Notificação ${kind} para id desconhecido no provedor (${dataId}); ignorada.`);
        return;
      }
      if (error instanceof PaymentProviderError) {
        throw new ServiceUnavailableException("Provedor de pagamento indisponível.");
      }
      throw error;
    }
  }

  private async processNotification(kind: string, dataId: string): Promise<void> {
    if (kind === "payment") {
      const payment = await this.asaas.getPayment(dataId);
      // Pix: a referência é a tentativa. Mensalidade do cartão: a cobrança vem do cliente da tentativa.
      const attemptId = this.attemptIdFrom(payment.externalReference) ?? (await this.attemptIdForCustomer(payment.customer));
      if (attemptId) await this.syncAttempt(attemptId);
      return;
    }
    if (kind === "subscription") {
      const subscription = await this.asaas.getSubscription(dataId);
      const attemptId = await this.attemptIdForCustomer(subscription.customer);
      if (attemptId) await this.syncAttempt(attemptId);
      return;
    }
    if (kind === "checkout") {
      // O id só serve para achar a tentativa no NOSSO banco; o estado vem da releitura em syncAttempt.
      const attempt = await this.prisma.billingAttempt.findUnique({ where: { providerRef: dataId }, select: { id: true } });
      if (attempt) await this.syncAttempt(attempt.id);
    }
  }

  private attemptIdFrom(reference: string | null | undefined): string | null {
    return reference && UUID.test(reference) ? reference : null;
  }

  // A tentativa mais recente do cliente (o id do cliente vem da releitura no provedor, nunca do corpo do aviso).
  private async attemptIdForCustomer(customerId: string | undefined): Promise<string | null> {
    if (!customerId) return null;
    const attempt = await this.prisma.billingAttempt.findFirst({
      // Só a tentativa da ASSINATURA: o cliente também é reaproveitado nos Pix de upgrade, que não são mensalidade.
      where: { providerCustomerId: customerId, kind: BillingAttemptKind.SUBSCRIPTION },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return attempt?.id ?? null;
  }
}

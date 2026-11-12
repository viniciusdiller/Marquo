import { BadGatewayException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { centsToReais } from "./pricing";

const PRODUCTION_API_BASE = "https://api.asaas.com/v3";
const SANDBOX_API_BASE = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_CHECKOUT_BASE = "https://asaas.com/checkoutSession/show";
const SANDBOX_CHECKOUT_BASE = "https://sandbox.asaas.com/checkoutSession/show";
const REQUEST_TIMEOUT_MS = 15_000;
// O Asaas exige um User-Agent identificando a integração (contas novas recusam chamadas sem ele).
const USER_AGENT = "Marquo";

// Status de cobrança do Asaas. Pagas de verdade: CONFIRMED (cartão aprovado) e RECEIVED (dinheiro disponível, Pix).
// RECEIVED_IN_CASH é "recebi em dinheiro", marcado À MÃO por quem opera a conta: nunca vem do pagador, então não vale.
export const ASAAS_PAID_STATUSES = ["CONFIRMED", "RECEIVED"] as const;
// Cobrança desfeita: devolvida, estornada ou contestada. Não deve mais creditar acesso.
export const ASAAS_REVERSED_STATUSES = ["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"] as const;

export interface AsaasCustomer {
  id: string;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value?: number;
  dueDate?: string;
  confirmedDate?: string | null;
  paymentDate?: string | null;
  externalReference?: string | null;
  subscription?: string | null;
  customer?: string;
  deleted?: boolean;
}

export interface AsaasPixQrCode {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}

export interface AsaasSubscription {
  id: string;
  // ACTIVE | INACTIVE | EXPIRED
  status: string;
  value?: number;
  nextDueDate?: string | null;
  cycle?: string;
  customer?: string;
  deleted?: boolean;
}

export interface AsaasCheckout {
  id: string;
  link?: string | null;
}

interface AsaasList<T> {
  data?: T[];
  hasMore?: boolean;
}

// Só identifica de que ambiente é a chave, para conferir no log do boot se é a credencial que você pensa que é
// (sandbox x produção). NUNCA devolve a chave nem pedaço dela.
export function describeApiKey(key: string): "sandbox" | "produção" | "formato não reconhecido" {
  const trimmed = key.trim();
  if (/^\$aact_hmlg_/.test(trimmed)) return "sandbox";
  if (/^\$aact_prod_/.test(trimmed)) return "produção";
  return "formato não reconhecido";
}

// Falha ao falar com o provedor. A mensagem do provedor/corpo da resposta NUNCA vai para o cliente (pode conter
// dado interno); ela só é logada, sem a chave.
export class PaymentProviderError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

// Cliente HTTP mínimo do Asaas (sem SDK: uma dependência a menos para auditar). Só fala com UM host fixo (produção ou
// sandbox, conforme a chave), com timeout, e nunca devolve o corpo de erro do provedor ao usuário.
@Injectable()
export class AsaasClient implements OnModuleInit {
  private readonly logger = new Logger(AsaasClient.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>("ASAAS_API_KEY");
    if (key) this.logger.log(`Asaas ligado: ambiente ${describeApiKey(key)}`);
    else this.logger.log("Asaas desligado (sem ASAAS_API_KEY): as rotas de cobrança respondem 503.");
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("ASAAS_API_KEY"));
  }

  private isSandbox(): boolean {
    const key = this.config.get<string>("ASAAS_API_KEY") ?? "";
    return describeApiKey(key) === "sandbox";
  }

  // Base da API. Só dá para sobrescrever fora de produção (testes com um servidor falso): em produção é sempre o host
  // oficial, então nenhuma configuração aponta a chave para outro lugar.
  private apiBase(): string {
    if (this.config.get<string>("NODE_ENV") !== "production") {
      const override = this.config.get<string>("ASAAS_API_BASE");
      if (override) return override.replace(/\/+$/, "");
    }
    return this.isSandbox() ? SANDBOX_API_BASE : PRODUCTION_API_BASE;
  }

  // Endereço da página de pagamento hospedada. Usa o `link` que o provedor devolveu quando houver; senão monta a
  // partir do id (o id é sempre texto vindo do provedor, nunca do usuário).
  checkoutUrl(checkout: AsaasCheckout): string {
    if (checkout.link && /^https:\/\//.test(checkout.link)) return checkout.link;
    const base = this.isSandbox() ? SANDBOX_CHECKOUT_BASE : PRODUCTION_CHECKOUT_BASE;
    return `${base}?id=${encodeURIComponent(checkout.id)}`;
  }

  private async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    const key = this.config.get<string>("ASAAS_API_KEY");
    if (!key) throw new ServiceUnavailableException("Pagamento online indisponível no momento.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.apiBase()}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          access_token: key,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        // Corpo logado só em nível de aviso, truncado, e nunca devolvido ao usuário.
        this.logger.warn(`Asaas ${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
        throw new PaymentProviderError(response.status, `Asaas respondeu ${response.status}`);
      }
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      this.logger.warn(`Asaas ${method} ${path} falhou: ${(error as Error).name}`);
      throw new PaymentProviderError(null, "Falha de comunicação com o Asaas");
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Cliente ──────────────────────────────────────────────

  // O Asaas só emite cobrança para cliente com CPF/CNPJ. `externalReference` amarra o cliente à tentativa nossa.
  createCustomer(input: { name: string; email: string; cpfCnpj: string; externalReference: string }): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>("POST", "/customers", {
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj,
      externalReference: input.externalReference,
      // O Marquo é quem avisa o dono; sem isto o Asaas manda e-mail e SMS próprios a cada cobrança.
      notificationDisabled: true,
    });
  }

  // ── Pix (uma cobrança por mês) ───────────────────────────

  createPixPayment(input: {
    customerId: string;
    amountCents: number;
    dueDate: string;
    description: string;
    externalReference: string;
  }): Promise<AsaasPayment> {
    return this.request<AsaasPayment>("POST", "/payments", {
      customer: input.customerId,
      billingType: "PIX",
      value: centsToReais(input.amountCents),
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    });
  }

  getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return this.request<AsaasPixQrCode>("GET", `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
  }

  getPayment(id: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`);
  }

  // Remove uma cobrança ainda não paga (Pix que expirou na nossa conta não pode ser pago depois). "Já não existe" (404)
  // conta como feito.
  async deletePayment(id: string): Promise<void> {
    try {
      await this.request("DELETE", `/payments/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof PaymentProviderError && error.status === 404) return;
      throw error;
    }
  }

  // ── Cartão recorrente (Checkout hospedado + assinatura) ──

  // O pagador digita o cartão na página do Asaas: o cartão nunca passa por aqui. Concluído o checkout, o Asaas cria a
  // assinatura mensal sozinho. `customerId` já tem os dados do pagador (e o CPF/CNPJ), então a tela não os pede de novo.
  createCheckout(input: {
    customerId: string;
    itemName: string;
    itemDescription: string;
    amountCents: number;
    nextDueDate: string;
    minutesToExpire: number;
    successUrl: string;
    cancelUrl: string;
    expiredUrl: string;
  }): Promise<AsaasCheckout> {
    return this.request<AsaasCheckout>("POST", "/checkouts", {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: input.minutesToExpire,
      customer: input.customerId,
      callback: { successUrl: input.successUrl, cancelUrl: input.cancelUrl, expiredUrl: input.expiredUrl },
      items: [
        {
          name: input.itemName,
          description: input.itemDescription,
          quantity: 1,
          value: centsToReais(input.amountCents),
        },
      ],
      subscription: { cycle: "MONTHLY", nextDueDate: input.nextDueDate },
    });
  }

  async listSubscriptionsByCustomer(customerId: string): Promise<AsaasSubscription[]> {
    const result = await this.request<AsaasList<AsaasSubscription>>(
      "GET",
      `/subscriptions?customer=${encodeURIComponent(customerId)}&limit=10`,
    );
    return result?.data ?? [];
  }

  getSubscription(id: string): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
  }

  async listSubscriptionPayments(id: string): Promise<AsaasPayment[]> {
    const result = await this.request<AsaasList<AsaasPayment>>(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}/payments?limit=100`,
    );
    return result?.data ?? [];
  }

  // Muda o valor da recorrência. `updatePendingPayments` leva a mudança também à cobrança do próximo mês, que o Asaas já
  // gerou com antecedência. Em assinatura de cartão o Asaas exige a tokenização habilitada na conta.
  updateSubscriptionValue(id: string, amountCents: number): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>("PUT", `/subscriptions/${encodeURIComponent(id)}`, {
      value: centsToReais(amountCents),
      updatePendingPayments: true,
    });
  }

  // Encerra a recorrência de vez (e remove as cobranças pendentes/vencidas dela). O que já foi pago fica. "Já não
  // existe" (404) conta como feito.
  async deleteSubscription(id: string): Promise<void> {
    try {
      await this.request("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof PaymentProviderError && error.status === 404) return;
      throw error;
    }
  }
}

export function toBadGateway(): BadGatewayException {
  return new BadGatewayException("Não foi possível falar com o serviço de pagamento agora. Tente novamente em instantes.");
}

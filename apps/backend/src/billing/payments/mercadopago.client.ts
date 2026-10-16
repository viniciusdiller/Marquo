import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { centsToReais } from "./pricing";

const DEFAULT_API_BASE = "https://api.mercadopago.com";
const REQUEST_TIMEOUT_MS = 10_000;

export interface MpPreapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled" | string;
  init_point?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string | null;
  date_created?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
  summarized?: { charged_quantity?: number | null; last_charged_date?: string | null } | null;
}

export interface MpPayment {
  id: number | string;
  status: "approved" | "pending" | "in_process" | "rejected" | "cancelled" | "refunded" | "charged_back" | string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
}

export interface MpAuthorizedPayment {
  id: number | string;
  preapproval_id?: string;
  status?: string;
}

// Falha ao falar com o provedor. A mensagem do provedor/corpo da resposta NUNCA vai para o cliente (pode conter
// dado interno); ela só é logada, sem o token.
export class PaymentProviderError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

// Cliente HTTP mínimo do Mercado Pago (sem SDK: uma dependência a menos para auditar). Só fala com UM host fixo
// (api.mercadopago.com), com timeout, e nunca devolve o corpo de erro do provedor ao usuário.
@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN"));
  }

  // Base da API. Só dá para sobrescrever fora de produção (testes com um servidor falso): em produção é sempre o
  // host oficial, então nenhuma configuração aponta o token para outro lugar.
  private apiBase(): string {
    if (this.config.get<string>("NODE_ENV") === "production") return DEFAULT_API_BASE;
    return (this.config.get<string>("MERCADOPAGO_API_BASE") ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const token = this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
    if (!token) throw new ServiceUnavailableException("Pagamento online indisponível no momento.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.apiBase()}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        // Corpo logado só em nível de aviso, truncado, e nunca devolvido ao usuário.
        this.logger.warn(`Mercado Pago ${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
        throw new PaymentProviderError(response.status, `Mercado Pago respondeu ${response.status}`);
      }
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      this.logger.warn(`Mercado Pago ${method} ${path} falhou: ${(error as Error).name}`);
      throw new PaymentProviderError(null, "Falha de comunicação com o Mercado Pago");
    } finally {
      clearTimeout(timer);
    }
  }

  createPreapproval(input: {
    reason: string;
    externalReference: string;
    payerEmail: string;
    amountCents: number;
    backUrl: string;
    notificationUrl: string | null;
    idempotencyKey: string;
  }): Promise<MpPreapproval> {
    return this.request<MpPreapproval>(
      "POST",
      "/preapproval",
      {
        reason: input.reason,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: centsToReais(input.amountCents),
          currency_id: "BRL",
        },
        back_url: input.backUrl,
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
        status: "pending",
      },
      input.idempotencyKey,
    );
  }

  getPreapproval(id: string): Promise<MpPreapproval> {
    return this.request<MpPreapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
  }

  updatePreapprovalAmount(id: string, amountCents: number): Promise<MpPreapproval> {
    return this.request<MpPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, {
      auto_recurring: { transaction_amount: centsToReais(amountCents), currency_id: "BRL" },
    });
  }

  cancelPreapproval(id: string): Promise<MpPreapproval> {
    return this.request<MpPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" });
  }

  createPixPayment(input: {
    description: string;
    externalReference: string;
    payerEmail: string;
    amountCents: number;
    expiresAt: string;
    notificationUrl: string | null;
    idempotencyKey: string;
  }): Promise<MpPayment> {
    return this.request<MpPayment>(
      "POST",
      "/v1/payments",
      {
        transaction_amount: centsToReais(input.amountCents),
        description: input.description,
        payment_method_id: "pix",
        payer: { email: input.payerEmail },
        external_reference: input.externalReference,
        date_of_expiration: input.expiresAt,
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      },
      input.idempotencyKey,
    );
  }

  getPayment(id: string): Promise<MpPayment> {
    return this.request<MpPayment>("GET", `/v1/payments/${encodeURIComponent(id)}`);
  }

  getAuthorizedPayment(id: string): Promise<MpAuthorizedPayment> {
    return this.request<MpAuthorizedPayment>("GET", `/authorized_payments/${encodeURIComponent(id)}`);
  }
}

export function toBadGateway(): BadGatewayException {
  return new BadGatewayException("Não foi possível falar com o serviço de pagamento agora. Tente novamente em instantes.");
}

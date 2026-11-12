"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { isAsaasCheckoutUrl, type BillingMethod, type PlanTier } from "@/lib/billing";
import { hasCpfOrCnpjLength, onlyDigits } from "@/lib/masks";

// Server Actions da cobrança. O cliente só informa QUAL plano, o código do cupom e (ao pagar) o CPF/CNPJ do pagador, que o
// Asaas exige para emitir a cobrança: preço, desconto, valor cobrado, e-mail do pagador e tenant são sempre do backend
// (JWT + catálogo + cupom). Os dados do pagador (documento, telefone, endereço) vão ao backend, que os valida, guarda
// (o CPF/CNPJ criptografado) e os repassa ao provedor; o que não for digitado sai do cadastro de cobrança salvo.

const TIERS: readonly PlanTier[] = ["ESSENCIAL", "PROFISSIONAL", "PREMIUM"];

export interface QuoteView {
  tier: PlanTier;
  planName: string;
  listPriceCents: number;
  discountCents: number;
  chargeCents: number;
  coupon: { code: string; kind: "TRIAL_DAYS" | "PERCENT" | "FIXED_CENTS"; value: number; fromSignup: boolean } | null;
  couponError: string | null;
}

export interface PixView {
  attemptId: string;
  chargeCents: number;
  expiresAt: string;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
}

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    if (err.statusCode === 401) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    if (err.statusCode === 429) return { ok: false, error: "Muitas tentativas. Aguarde um minuto." };
    return { ok: false, error: err.message };
  }
  return { ok: false, error: "Erro inesperado. Tente novamente." };
}

function validTier(tier: string): tier is PlanTier {
  return (TIERS as readonly string[]).includes(tier);
}

function body(tier: PlanTier, coupon: string) {
  const code = coupon.trim();
  return JSON.stringify(code ? { tier, couponCode: code } : { tier });
}

// Dados do pagador digitados no checkout. Campo vazio = "usar o cadastro salvo" (não é enviado).
export interface PayerForm {
  cpfCnpj: string;
  phone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
}

export interface BillingProfileView {
  documentHint: string | null;
  phone: string | null;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  complement: string | null;
  province: string | null;
  canStoreDocument: boolean;
  missingForCard: string[];
  missingForPix: string[];
}

// Só o tamanho é conferido aqui (aviso rápido); o backend confere os dígitos verificadores e tudo mais.
const DOCUMENT_ERROR = "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.";

function payBody(tier: PlanTier, coupon: string, payer: Partial<PayerForm>) {
  const code = coupon.trim();
  const out: Record<string, string> = { tier };
  if (code) out.couponCode = code;
  const document = onlyDigits(payer.cpfCnpj ?? "");
  if (document) out.cpfCnpj = document;
  const phone = onlyDigits(payer.phone ?? "");
  if (phone) out.phone = phone;
  const postal = onlyDigits(payer.postalCode ?? "");
  if (postal) out.postalCode = postal;
  for (const key of ["address", "addressNumber", "complement", "province"] as const) {
    const value = (payer[key] ?? "").trim();
    if (value) out[key] = value;
  }
  return JSON.stringify(out);
}

export async function billingProfileAction(): Promise<ActionResult<{ profile: BillingProfileView }>> {
  try {
    const profile = await authedFetch<BillingProfileView>("/billing/profile");
    return { ok: true, profile };
  } catch (err) {
    return failure(err);
  }
}

export async function quoteAction(tier: string, coupon: string): Promise<ActionResult<{ quote: QuoteView }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  try {
    const quote = await authedFetch<QuoteView>("/billing/quote", { method: "POST", body: body(tier, coupon) });
    return { ok: true, quote };
  } catch (err) {
    return failure(err);
  }
}

export async function startCardAction(
  tier: string,
  coupon: string,
  payer: Partial<PayerForm>,
): Promise<ActionResult<{ url: string }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  if (payer.cpfCnpj && !hasCpfOrCnpjLength(payer.cpfCnpj)) return { ok: false, error: DOCUMENT_ERROR };
  try {
    const result = await authedFetch<{ url: string }>("/billing/checkout/card", {
      method: "POST",
      body: payBody(tier, coupon, payer),
    });
    // Nunca leva o dono para fora do Asaas, mesmo que a resposta venha adulterada.
    if (!isAsaasCheckoutUrl(result.url)) return { ok: false, error: "Não foi possível abrir o pagamento agora. Tente novamente." };
    return { ok: true, url: result.url };
  } catch (err) {
    return failure(err);
  }
}

export async function startPixAction(
  tier: string,
  coupon: string,
  payer: Partial<PayerForm>,
): Promise<ActionResult<{ pix: PixView }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  if (payer.cpfCnpj && !hasCpfOrCnpjLength(payer.cpfCnpj)) return { ok: false, error: DOCUMENT_ERROR };
  try {
    const pix = await authedFetch<PixView>("/billing/checkout/pix", {
      method: "POST",
      body: payBody(tier, coupon, payer),
    });
    return { ok: true, pix };
  } catch (err) {
    return failure(err);
  }
}

export interface AttemptStatusView {
  status: "PENDING" | "APPROVED" | "FAILED" | "EXPIRED";
  method: BillingMethod;
  kind?: "SUBSCRIPTION" | "PLAN_UPGRADE";
}

export async function attemptStatusAction(attemptId: string): Promise<ActionResult<{ attempt: AttemptStatusView }>> {
  try {
    const attempt = await authedFetch<AttemptStatusView>(`/billing/attempts/${encodeURIComponent(attemptId)}`);
    if (attempt.status === "APPROVED") revalidatePath("/dashboard", "layout");
    return { ok: true, attempt };
  } catch (err) {
    return failure(err);
  }
}

// Prévia da troca de plano. O valor da diferença (upgrade) é SEMPRE calculado no backend: a tela só mostra.
export interface ChangePlanQuoteView {
  tier: PlanTier;
  planName: string;
  kind: "IMMEDIATE" | "PAYMENT";
  newPriceCents: number;
  currentPriceCents: number;
  chargeCents: number | null;
  remainingDays: number | null;
  effective: string;
}

export async function quoteChangePlanAction(tier: string): Promise<ActionResult<{ quote: ChangePlanQuoteView }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  try {
    const quote = await authedFetch<ChangePlanQuoteView>("/billing/change-plan/quote", {
      method: "POST",
      body: JSON.stringify({ tier }),
    });
    return { ok: true, quote };
  } catch (err) {
    return failure(err);
  }
}

// Troca para plano mais barato vale na hora (`applied`). Para plano mais caro o backend devolve o Pix da diferença
// (`requiresPayment`) e o plano só sobe quando o pagamento for confirmado: nada é trocado por esta chamada.
export type ChangePlanOutcome =
  | { applied: true; planName: string; effective: string }
  | { applied: false; planName: string; pix: PixView };

export async function changePlanAction(tier: string, cpfCnpj?: string): Promise<ActionResult<{ outcome: ChangePlanOutcome }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  const document = cpfCnpj ? onlyDigits(cpfCnpj) : "";
  if (document && !hasCpfOrCnpjLength(document)) return { ok: false, error: DOCUMENT_ERROR };
  try {
    const result = await authedFetch<
      | { applied: true; planName: string; effective: string }
      | ({ applied: false; requiresPayment: true; planName: string } & PixView)
    >("/billing/change-plan", {
      method: "POST",
      body: JSON.stringify(document ? { tier, cpfCnpj: document } : { tier }),
    });
    if (result.applied) {
      revalidatePath("/dashboard", "layout");
      return { ok: true, outcome: { applied: true, planName: result.planName, effective: result.effective } };
    }
    const { applied: _applied, requiresPayment: _requiresPayment, planName, ...pix } = result;
    void _applied;
    void _requiresPayment;
    return { ok: true, outcome: { applied: false, planName, pix } };
  } catch (err) {
    return failure(err);
  }
}

export async function syncBillingAction(): Promise<ActionResult<object>> {
  try {
    await authedFetch("/billing/sync", { method: "POST" });
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function cancelSubscriptionAction(): Promise<ActionResult<object>> {
  try {
    await authedFetch("/billing/cancel", { method: "POST" });
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

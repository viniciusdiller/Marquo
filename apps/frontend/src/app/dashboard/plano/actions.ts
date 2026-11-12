"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import type { BillingMethod, PlanTier } from "@/lib/billing";
import { hasCpfOrCnpjLength, onlyDigits } from "@/lib/masks";

// Server Actions da cobrança. O cliente só informa QUAL plano, o código do cupom e (ao pagar) o CPF/CNPJ do pagador, que o
// Asaas exige para emitir a cobrança: preço, desconto, valor cobrado, e-mail do pagador e tenant são sempre do backend
// (JWT + catálogo + cupom). O documento vai direto ao backend e dele ao provedor; o Marquo não o guarda.

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

// Ao pagar o documento é obrigatório. O tamanho é só um aviso rápido; o backend confere os dígitos verificadores.
const DOCUMENT_ERROR = "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.";

function payBody(tier: PlanTier, coupon: string, cpfCnpj: string) {
  const code = coupon.trim();
  const document = onlyDigits(cpfCnpj);
  return JSON.stringify(code ? { tier, couponCode: code, cpfCnpj: document } : { tier, cpfCnpj: document });
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
  cpfCnpj: string,
): Promise<ActionResult<{ url: string }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  if (!hasCpfOrCnpjLength(cpfCnpj)) return { ok: false, error: DOCUMENT_ERROR };
  try {
    const result = await authedFetch<{ url: string }>("/billing/checkout/card", {
      method: "POST",
      body: payBody(tier, coupon, cpfCnpj),
    });
    return { ok: true, url: result.url };
  } catch (err) {
    return failure(err);
  }
}

export async function startPixAction(
  tier: string,
  coupon: string,
  cpfCnpj: string,
): Promise<ActionResult<{ pix: PixView }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  if (!hasCpfOrCnpjLength(cpfCnpj)) return { ok: false, error: DOCUMENT_ERROR };
  try {
    const pix = await authedFetch<PixView>("/billing/checkout/pix", {
      method: "POST",
      body: payBody(tier, coupon, cpfCnpj),
    });
    return { ok: true, pix };
  } catch (err) {
    return failure(err);
  }
}

export interface AttemptStatusView {
  status: "PENDING" | "APPROVED" | "FAILED" | "EXPIRED";
  method: BillingMethod;
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

export async function changePlanAction(tier: string): Promise<ActionResult<{ planName: string; effective: string }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  try {
    const result = await authedFetch<{ planName: string; effective: string }>("/billing/change-plan", {
      method: "POST",
      body: JSON.stringify({ tier }),
    });
    revalidatePath("/dashboard", "layout");
    return { ok: true, planName: result.planName, effective: result.effective };
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

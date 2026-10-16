"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import type { BillingMethod, PlanTier } from "@/lib/billing";

// Server Actions da cobrança. O cliente só informa QUAL plano e o código do cupom: preço, desconto, valor
// cobrado, e-mail do pagador e tenant são sempre do backend (JWT + catálogo + cupom). Estas ações não confiam
// em nada que venha da tela além disso.

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

export async function quoteAction(tier: string, coupon: string): Promise<ActionResult<{ quote: QuoteView }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  try {
    const quote = await authedFetch<QuoteView>("/billing/quote", { method: "POST", body: body(tier, coupon) });
    return { ok: true, quote };
  } catch (err) {
    return failure(err);
  }
}

export async function startCardAction(tier: string, coupon: string): Promise<ActionResult<{ url: string }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  try {
    const result = await authedFetch<{ url: string }>("/billing/checkout/card", {
      method: "POST",
      body: body(tier, coupon),
    });
    return { ok: true, url: result.url };
  } catch (err) {
    return failure(err);
  }
}

export async function startPixAction(tier: string, coupon: string): Promise<ActionResult<{ pix: PixView }>> {
  if (!validTier(tier)) return { ok: false, error: "Plano inválido." };
  try {
    const pix = await authedFetch<PixView>("/billing/checkout/pix", { method: "POST", body: body(tier, coupon) });
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

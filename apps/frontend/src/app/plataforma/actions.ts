"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { moneyToCents } from "@/lib/masks";
import { clearPlatformToken, platformFetch } from "@/lib/platform-session";

// Ações do painel. Toda chamada leva o cookie da plataforma e o backend revalida a sessão e as regras
// (a UI nunca é a fonte de verdade). `id` vem da URL/argumento: assertSafeApiPath (em platformFetch)
// barra `..`/`%2f` e o backend exige UUID.

export interface PlatformActionResult {
  ok: boolean;
  error?: string;
  // Só no link de redefinição / criação de negócio: exibido UMA vez, nunca guardado.
  link?: string;
  expiresAt?: string;
  ownerEmail?: string;
  // Só na criação de negócio.
  tenantId?: string;
  tenantName?: string;
}

function toError(err: unknown): PlatformActionResult {
  if (err instanceof ApiError) {
    if (err.statusCode === 401) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    if (err.statusCode === 429) return { ok: false, error: "Muitas tentativas. Aguarde um minuto." };
    return { ok: false, error: err.message };
  }
  return { ok: false, error: "Erro inesperado." };
}

export async function signOutPlatformAction() {
  await clearPlatformToken();
  redirect("/entrar");
}

export async function suspendTenantAction(id: string, reason: string): Promise<PlatformActionResult> {
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

// Exclusão dos dados de um negócio (irreversível). A confirmação digitada e o motivo são REVALIDADOS no backend, que
// também decide se o negócio pode ser excluído (acesso encerrado) e se o prazo de 90 dias já terminou.
export async function purgeTenantDataAction(
  id: string,
  confirmSlug: string,
  reason: string,
): Promise<PlatformActionResult> {
  if (!confirmSlug.trim()) return { ok: false, error: "Digite o endereço do negócio para confirmar." };
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/delete`, {
      method: "POST",
      body: JSON.stringify({ confirmSlug, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

// Define quanto teste grátis o negócio TEM a partir de hoje (0 encerra agora; até 365). O backend calcula a data final e
// revalida tudo (limites, negócio sem assinatura, concorrência); aqui só se confere o formato para dar erro rápido.
export async function setTrialAction(id: string, days: number): Promise<PlatformActionResult> {
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    return { ok: false, error: "Informe de 0 a 365 dias." };
  }
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/set-trial`, {
      method: "POST",
      body: JSON.stringify({ days }),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

const PLAN_TIERS = ["ESSENCIAL", "PROFISSIONAL", "PREMIUM"];

// Novo preço mensal do plano, digitado em reais ("39,90"). Só confere o formato para dar erro rápido: o backend limita entre
// o piso e o teto do plano, e exige plano maior mais caro que o menor.
export async function setPlanPriceAction(tier: string, price: string): Promise<PlatformActionResult> {
  if (!PLAN_TIERS.includes(tier)) return { ok: false, error: "Plano inválido." };
  const priceCents = moneyToCents(price);
  if (priceCents === null || priceCents <= 0) return { ok: false, error: "Informe um valor válido, como 39,90." };
  try {
    await platformFetch(`/platform/plans/${tier}/price`, { method: "PUT", body: JSON.stringify({ priceCents }) });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function reactivateTenantAction(id: string): Promise<PlatformActionResult> {
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/reactivate`, { method: "POST" });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function extendTrialAction(id: string, days: number): Promise<PlatformActionResult> {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { ok: false, error: "Informe de 1 a 90 dias." };
  }
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/extend-trial`, {
      method: "POST",
      body: JSON.stringify({ days }),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function grantCourtesyAction(
  id: string,
  tier: "ESSENCIAL" | "PROFISSIONAL" | "PREMIUM",
  days: number | null,
): Promise<PlatformActionResult> {
  if (!["ESSENCIAL", "PROFISSIONAL", "PREMIUM"].includes(tier)) {
    return { ok: false, error: "Plano inválido." };
  }
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 730)) {
    return { ok: false, error: "Informe de 1 a 730 dias." };
  }
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/courtesy`, {
      method: "PUT",
      body: JSON.stringify(days === null ? { tier } : { tier, days }),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function removeCourtesyAction(id: string): Promise<PlatformActionResult> {
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/courtesy`, { method: "DELETE" });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function updateOwnerPhoneAction(id: string, phone: string): Promise<PlatformActionResult> {
  try {
    await platformFetch(`/platform/tenants/${encodeURIComponent(id)}/owner-phone`, {
      method: "PUT",
      body: JSON.stringify({ phone }),
    });
    revalidatePath("/plataforma", "layout");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function createCouponAction(input: {
  code: string;
  kind: "TRIAL_DAYS" | "PERCENT" | "FIXED_CENTS";
  value: number;
  description?: string;
  maxRedemptions?: number;
  validUntil?: string;
}): Promise<PlatformActionResult> {
  try {
    await platformFetch("/platform/coupons", { method: "POST", body: JSON.stringify(input) });
    revalidatePath("/plataforma/cupons");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function setCouponActiveAction(id: string, isActive: boolean): Promise<PlatformActionResult> {
  try {
    await platformFetch(`/platform/coupons/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
    revalidatePath("/plataforma/cupons");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function passwordResetLinkAction(id: string): Promise<PlatformActionResult> {
  try {
    const result = await platformFetch<{ link: string; expiresAt: string; ownerEmail: string }>(
      `/platform/tenants/${encodeURIComponent(id)}/password-reset-link`,
      { method: "POST" },
    );
    revalidatePath("/plataforma", "layout");
    return { ok: true, link: result.link, expiresAt: result.expiresAt, ownerEmail: result.ownerEmail };
  } catch (err) {
    return toError(err);
  }
}

export async function createTenantAction(input: {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
}): Promise<PlatformActionResult> {
  try {
    const result = await platformFetch<{
      tenant: { id: string; name: string };
      ownerEmail: string;
      link: string;
      expiresAt: string;
    }>("/platform/tenants", {
      method: "POST",
      body: JSON.stringify({
        businessName: input.businessName,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
      }),
    });
    revalidatePath("/plataforma", "layout");
    return {
      ok: true,
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
      ownerEmail: result.ownerEmail,
      link: result.link,
      expiresAt: result.expiresAt,
    };
  } catch (err) {
    return toError(err);
  }
}

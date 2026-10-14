"use server";

import { revalidatePath } from "next/cache";
import type { CashFlowReport, DreReport } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { moneyToCents } from "@/lib/masks";

export interface FinanceActionState {
  error?: string;
}

function fail(err: unknown): FinanceActionState {
  return { error: err instanceof ApiError ? err.message : "Erro inesperado." };
}

export async function createEntryAction(
  _p: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const paid = formData.get("paidNow") === "on";
  const rawAmount = formData.get("amount");
  const amountCents = moneyToCents(typeof rawAmount === "string" ? rawAmount : null);
  if (amountCents === null || amountCents < 1) return { error: "Informe um valor válido (ex: 45,90)." };
  try {
    await authedFetch("/finance/entries", {
      method: "POST",
      body: JSON.stringify({
        direction: String(formData.get("direction")),
        description: String(formData.get("description") ?? "").trim(),
        amountCents,
        dueDate: String(formData.get("dueDate")),
        categoryId: String(formData.get("categoryId") || "") || undefined,
        counterparty: String(formData.get("counterparty") ?? "").trim() || undefined,
        paidAt: paid ? String(formData.get("dueDate")) : undefined,
      }),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/financeiro");
  return {};
}

export async function settleEntryAction(id: string): Promise<FinanceActionState> {
  try {
    await authedFetch(`/finance/entries/${encodeURIComponent(id)}/settle`, { method: "POST", body: JSON.stringify({}) });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/financeiro");
  return {};
}

export async function cancelEntryAction(id: string): Promise<FinanceActionState> {
  try {
    await authedFetch(`/finance/entries/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({}) });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/financeiro");
  return {};
}

export async function fetchCashFlowAction(from: string, to: string): Promise<CashFlowReport> {
  return authedFetch<CashFlowReport>(
    `/finance/cash-flow?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export async function fetchDreAction(from: string, to: string): Promise<DreReport> {
  return authedFetch<DreReport>(
    `/finance/dre?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { moneyToCents, parseIntStrict } from "@/lib/masks";

export interface ClubActionState {
  error?: string;
  ok?: boolean;
}

function fail(error: unknown, fallback: string): ClubActionState {
  return { error: error instanceof ApiError ? error.message : fallback };
}

function done(): ClubActionState {
  revalidatePath("/dashboard/clube");
  return { ok: true };
}

export async function setClubEnabledAction(enabled: boolean): Promise<ClubActionState> {
  try {
    await authedFetch("/club", { method: "PATCH", body: JSON.stringify({ enabled }) });
  } catch (error) {
    return fail(error, "Não foi possível alterar o clube.");
  }
  return done();
}

// Dinheiro viaja como texto BRL e é convertido aqui, de forma estrita (nunca 0 em silêncio). Os serviços são só ids: o
// backend confere que são deste negócio.
export async function createClubPlanAction(
  _prev: ClubActionState | undefined,
  formData: FormData,
): Promise<ClubActionState> {
  const rawPrice = formData.get("price");
  const priceCents = moneyToCents(typeof rawPrice === "string" ? rawPrice : null);
  const rawUses = formData.get("usesPerMonth");
  const usesPerMonth = parseIntStrict(typeof rawUses === "string" ? rawUses : null);
  const serviceIds = formData.getAll("serviceIds").map(String);

  if (priceCents === null || priceCents < 100) return { error: "Informe o valor mensal do pacote (mínimo R$ 1,00)." };
  if (usesPerMonth === null || usesPerMonth < 1 || usesPerMonth > 60) return { error: "Os usos por mês devem ser de 1 a 60." };
  if (serviceIds.length === 0) return { error: "Marque pelo menos um serviço do pacote." };

  try {
    await authedFetch("/club/plans", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description") || undefined,
        priceCents,
        usesPerMonth,
        serviceIds,
      }),
    });
  } catch (error) {
    return fail(error, "Não foi possível criar o pacote.");
  }
  return done();
}

export async function setClubPlanActiveAction(id: string, isActive: boolean): Promise<ClubActionState> {
  try {
    await authedFetch(`/club/plans/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
  } catch (error) {
    return fail(error, "Não foi possível atualizar o pacote.");
  }
  return done();
}

export async function enrollClubMemberAction(clientId: string, planId: string): Promise<ClubActionState> {
  try {
    await authedFetch("/club/members", { method: "POST", body: JSON.stringify({ clientId, planId }) });
  } catch (error) {
    return fail(error, "Não foi possível inscrever o cliente.");
  }
  return done();
}

export async function renewClubMemberAction(id: string): Promise<ClubActionState> {
  try {
    await authedFetch(`/club/members/${encodeURIComponent(id)}/renew`, { method: "POST" });
  } catch (error) {
    return fail(error, "Não foi possível renovar.");
  }
  return done();
}

export async function cancelClubMemberAction(id: string): Promise<ClubActionState> {
  try {
    await authedFetch(`/club/members/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  } catch (error) {
    return fail(error, "Não foi possível cancelar a adesão.");
  }
  return done();
}

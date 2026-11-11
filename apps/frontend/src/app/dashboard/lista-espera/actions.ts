"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

const ALLOWED = new Set(["PENDING", "CONTACTED", "RESOLVED", "CANCELED"]);

export async function updateWaitlistStatusAction(
  id: string,
  status: string,
): Promise<{ error?: string }> {
  if (!ALLOWED.has(status)) return { error: "Status inválido." };
  try {
    await authedFetch(`/waitlist/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível atualizar." };
  }
  revalidatePath("/dashboard/lista-espera");
  return {};
}

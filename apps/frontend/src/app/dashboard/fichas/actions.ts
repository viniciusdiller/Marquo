"use server";

import { revalidatePath } from "next/cache";
import type { IntakeFieldDef } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

export interface IntakeFormActionState {
  error?: string;
}

interface IntakeFormPayload {
  name: string;
  fields: IntakeFieldDef[];
  isActive: boolean;
}

export async function saveIntakeFormAction(
  id: string | null,
  payload: IntakeFormPayload,
): Promise<IntakeFormActionState> {
  try {
    await authedFetch(id ? `/intake/forms/${encodeURIComponent(id)}` : "/intake/forms", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Erro ao salvar ficha." };
  }
  revalidatePath("/dashboard/fichas");
  return {};
}

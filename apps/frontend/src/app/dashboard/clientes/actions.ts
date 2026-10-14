"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IntakeFormSummary } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

export interface ClientFormState {
  error?: string;
}

interface ClientPayload {
  name?: string;
  phone?: string;
  email?: string | null;
  birthDate?: string | null;
  cpf?: string | null;
  notes?: string | null;
  tags?: string[];
}

function readPayload(formData: FormData): ClientPayload {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const tagsRaw = str("tags");
  return {
    name: str("name"),
    phone: str("phone"),
    email: str("email") || null,
    birthDate: str("birthDate") || null,
    cpf: str("cpf") || null,
    notes: str("notes") || null,
    tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
}

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  let created: { id: string };
  try {
    created = await authedFetch<{ id: string }>("/clients", {
      method: "POST",
      body: JSON.stringify(readPayload(formData)),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Erro ao salvar cliente." };
  }
  revalidatePath("/dashboard/clientes");
  redirect(`/dashboard/clientes/${created.id}`);
}

export async function updateClientAction(
  id: string,
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  try {
    await authedFetch(`/clients/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(readPayload(formData)),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Erro ao salvar cliente." };
  }
  revalidatePath(`/dashboard/clientes/${encodeURIComponent(id)}`);
  return {};
}

export async function submitIntakeResponseAction(
  clientId: string,
  formId: string,
  answers: Record<string, string | boolean>,
): Promise<ClientFormState> {
  try {
    await authedFetch("/intake/responses", {
      method: "POST",
      body: JSON.stringify({ clientId, formId, answers }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Erro ao salvar ficha." };
  }
  revalidatePath(`/dashboard/clientes/${clientId}`);
  return {};
}

export async function listIntakeFormsAction(): Promise<IntakeFormSummary[]> {
  return authedFetch<IntakeFormSummary[]>("/intake/forms").catch(() => []);
}

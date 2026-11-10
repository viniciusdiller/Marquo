"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

export interface CreateProfessionalState {
  error?: string;
}

export async function createProfessionalAction(
  _prevState: CreateProfessionalState | undefined,
  formData: FormData,
): Promise<CreateProfessionalState> {
  // "Eu também atendo": o dono vira profissional com a conta que já usa. Não envia nome, e-mail nem senha: o backend usa a
  // conta do token (nenhum campo de identidade viaja).
  if (formData.get("self") === "on") {
    try {
      await authedFetch("/professionals/self", {
        method: "POST",
        body: JSON.stringify({ serviceIds: formData.getAll("serviceIds").map(String) }),
      });
    } catch (error) {
      return { error: error instanceof ApiError ? error.message : "Não foi possível cadastrar." };
    }
    revalidatePath("/dashboard/profissionais");
    return {};
  }

  try {
    await authedFetch("/professionals", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        initialPassword: formData.get("initialPassword"),
        // Serviços marcados no formulário (checkboxes de mesmo nome). O backend confere que são do negócio.
        serviceIds: formData.getAll("serviceIds").map(String),
      }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível cadastrar." };
  }

  revalidatePath("/dashboard/profissionais");
  return {};
}

export async function toggleProfessionalActiveAction(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  try {
    await authedFetch(`/professionals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível atualizar." };
  }
  revalidatePath("/dashboard/profissionais");
  return {};
}

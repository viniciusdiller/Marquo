"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

export interface WorkingHoursInterval {
  weekday: string;
  startMinute: number;
  endMinute: number;
}

export interface ActionState {
  error?: string;
}

export async function updateWorkingHoursAction(
  professionalId: string,
  intervals: WorkingHoursInterval[],
): Promise<ActionState> {
  try {
    await authedFetch(`/professionals/${encodeURIComponent(professionalId)}/working-hours`, {
      method: "PUT",
      body: JSON.stringify({ intervals }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível salvar." };
  }
  revalidatePath(`/dashboard/profissionais/${encodeURIComponent(professionalId)}`);
  return {};
}

export async function updateProfessionalProfileAction(
  professionalId: string,
  input: { name: string; email: string; bio?: string },
): Promise<{ error?: string }> {
  try {
    await authedFetch(`/professionals/${encodeURIComponent(professionalId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível salvar." };
  }
  revalidatePath(`/dashboard/profissionais/${encodeURIComponent(professionalId)}`);
  revalidatePath("/dashboard/profissionais");
  return {};
}

export async function toggleServiceLinkAction(
  professionalId: string,
  serviceId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  try {
    await authedFetch(`/professionals/${encodeURIComponent(professionalId)}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceId, isActive }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível atualizar." };
  }
  revalidatePath(`/dashboard/profissionais/${encodeURIComponent(professionalId)}`);
  return {};
}

export interface CreateTimeBlockState {
  error?: string;
}

export async function createTimeBlockAction(
  professionalId: string,
  _prevState: CreateTimeBlockState | undefined,
  formData: FormData,
): Promise<CreateTimeBlockState> {
  const date = formData.get("date");
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");

  if (!date || !startTime || !endTime) {
    return { error: "Preencha data, início e fim." };
  }

  const startAt = new Date(`${date}T${startTime}:00`);
  const endAt = new Date(`${date}T${endTime}:00`);

  if (endAt <= startAt) {
    return { error: "O horário de término deve ser depois do início." };
  }

  try {
    await authedFetch("/time-blocks", {
      method: "POST",
      body: JSON.stringify({
        professionalId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: formData.get("reason") || undefined,
      }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível bloquear." };
  }

  revalidatePath(`/dashboard/profissionais/${encodeURIComponent(professionalId)}`);
  return {};
}

export async function deleteTimeBlockAction(
  professionalId: string,
  blockId: string,
): Promise<{ error?: string }> {
  try {
    await authedFetch(`/time-blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível remover." };
  }
  revalidatePath(`/dashboard/profissionais/${encodeURIComponent(professionalId)}`);
  return {};
}

// Foto do profissional: o backend reprocessa (WebP quadrado), confere a posse e apaga a anterior. Aqui só repassa o
// arquivo escolhido; o tipo/tamanho são revalidados lá.
export async function uploadProfessionalPhotoAction(
  professionalId: string,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione uma imagem." };

  try {
    const uploadData = new FormData();
    uploadData.set("file", file);
    await authedFetch(`/professionals/${encodeURIComponent(professionalId)}/photo`, {
      method: "POST",
      body: uploadData,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível enviar a foto." };
  }
  revalidatePath("/dashboard/profissionais", "layout");
  return {};
}

export async function removeProfessionalPhotoAction(professionalId: string): Promise<ActionState> {
  try {
    await authedFetch(`/professionals/${encodeURIComponent(professionalId)}/photo`, { method: "DELETE" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível remover a foto." };
  }
  revalidatePath("/dashboard/profissionais", "layout");
  return {};
}

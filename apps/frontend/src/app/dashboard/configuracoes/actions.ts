"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { normalizeInstagram, whatsappDigits } from "@/lib/masks";

export interface UpdateProfileState {
  error?: string;
  success?: boolean;
}

export async function updateTenantProfileAction(
  _prevState: UpdateProfileState | undefined,
  formData: FormData,
): Promise<UpdateProfileState> {
  const accentColor = String(formData.get("accentColor") ?? "").trim();
  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    return { error: "Cor inválida. Use o formato #RRGGBB." };
  }

  // O dono digita "(11) 91234-5678"; o backend guarda com DDI ("5511912345678", vira link wa.me).
  const whatsappRaw = String(formData.get("whatsappNumber") ?? "").trim();
  const whatsappNumber = whatsappRaw ? whatsappDigits(whatsappRaw) : "";
  if (whatsappRaw && !whatsappNumber) {
    return { error: "WhatsApp inválido. Informe DDD e número, ex: (11) 91234-5678." };
  }
  // Aceita "@salao", "salao" ou o link; o backend só aceita https://instagram.com/<usuário>.
  const instagramUrl = normalizeInstagram(String(formData.get("instagramUrl") ?? ""));
  if (instagramUrl === null) {
    return { error: "Instagram inválido. Use @seusalao ou o link do perfil." };
  }
  // Campo em branco é enviado como "" (limpa o valor salvo); antes virava undefined e ficava preso.
  const text = (key: string) => String(formData.get(key) ?? "").trim();

  try {
    await authedFetch("/tenants/me", {
      method: "PATCH",
      body: JSON.stringify({
        description: text("description"),
        address: text("address"),
        businessHours: text("businessHours"),
        accentColor: accentColor || undefined,
        whatsappNumber,
        instagramUrl,
        // Checkbox: só aparece no FormData quando marcado — por isso o estado real é
        // sempre calculado aqui e enviado explícito (nunca omitido), diferente dos campos
        // de texto acima onde "não preenchido" vira undefined (não altera o valor salvo).
        showServices: formData.get("showServices") === "on",
        showTeam: formData.get("showTeam") === "on",
        showGallery: formData.get("showGallery") === "on",
        showContact: formData.get("showContact") === "on",
        notifyStaffByEmail: formData.get("notifyStaffByEmail") === "on",
        minSchedulingLeadTimeMinutes: formData.get("minSchedulingLeadTimeMinutes") 
          ? parseInt(String(formData.get("minSchedulingLeadTimeMinutes")), 10) 
          : undefined,
        maxSchedulingLeadTimeDays: formData.get("maxSchedulingLeadTimeDays") 
          ? parseInt(String(formData.get("maxSchedulingLeadTimeDays")), 10) 
          : undefined,
      }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível salvar." };
  }

  revalidatePath("/dashboard/configuracoes");
  return { success: true };
}

export interface UploadLogoState {
  error?: string;
}

export async function uploadLogoAction(
  _prevState: UploadLogoState | undefined,
  formData: FormData,
): Promise<UploadLogoState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione uma imagem." };
  }

  try {
    const uploadData = new FormData();
    uploadData.set("file", file);
    await authedFetch("/tenants/me/logo", { method: "POST", body: uploadData });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível enviar a imagem." };
  }

  revalidatePath("/dashboard/configuracoes");
  return {};
}

export async function removeLogoAction(): Promise<{ error?: string }> {
  try {
    await authedFetch("/tenants/me/logo", { method: "DELETE" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível remover a logo." };
  }
  revalidatePath("/dashboard/configuracoes");
  return {};
}

export interface UploadGalleryImageState {
  error?: string;
}

export async function uploadGalleryImageAction(
  _prevState: UploadGalleryImageState | undefined,
  formData: FormData,
): Promise<UploadGalleryImageState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione uma imagem." };
  }

  try {
    const uploadData = new FormData();
    uploadData.set("file", file);
    await authedFetch("/tenants/me/gallery", { method: "POST", body: uploadData });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível enviar a imagem." };
  }

  revalidatePath("/dashboard/configuracoes");
  return {};
}

export async function removeGalleryImageAction(imageId: string): Promise<{ error?: string }> {
  try {
    await authedFetch(`/tenants/me/gallery/${encodeURIComponent(imageId)}`, { method: "DELETE" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Não foi possível remover a imagem." };
  }
  revalidatePath("/dashboard/configuracoes");
  return {};
}

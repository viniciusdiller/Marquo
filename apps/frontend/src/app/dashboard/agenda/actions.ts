"use server";

import { revalidatePath } from "next/cache";
import type { CalendarResponse, CreateStaffAppointmentInput } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function toError(err: unknown): ActionResult {
  return { ok: false, error: err instanceof ApiError ? err.message : "Erro inesperado." };
}

export async function fetchCalendarAction(
  from: string,
  to: string,
  professionalId?: string,
): Promise<CalendarResponse> {
  const params = new URLSearchParams({ from, to });
  if (professionalId) params.set("professionalId", professionalId);
  return authedFetch<CalendarResponse>(`/appointments/calendar?${params.toString()}`);
}

export async function createStaffAppointmentAction(
  input: CreateStaffAppointmentInput,
): Promise<ActionResult> {
  try {
    await authedFetch("/appointments", { method: "POST", body: JSON.stringify(input) });
    revalidatePath("/dashboard/agenda");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function setAppointmentStatusAction(
  id: string,
  status: "CONFIRMED" | "IN_SERVICE" | "COMPLETED" | "NO_SHOW",
): Promise<ActionResult> {
  try {
    await authedFetch(`/appointments/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    revalidatePath("/dashboard/agenda");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function cancelAppointmentAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/appointments/${encodeURIComponent(id)}/cancel`, { method: "PATCH" });
    revalidatePath("/dashboard/agenda");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function rescheduleAppointmentAction(
  id: string,
  startAt: string,
  professionalId?: string,
): Promise<ActionResult> {
  try {
    await authedFetch(`/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify({ startAt, professionalId }),
    });
    revalidatePath("/dashboard/agenda");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

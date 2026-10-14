"use server";

import type { CreateBookingInput, CreateWaitlistInput, PublicBooking } from "@marquo/shared-types";
import { ApiError } from "@/lib/api";
import { consumerAuthedFetch } from "@/lib/consumer-session";

// O cookie de sessão é httpOnly, então o navegador não consegue anexar o Bearer sozinho: o
// wizard chama estas Server Actions e é o servidor quem lê o cookie. Erro sempre devolvido
// como valor (não lançado) — o Next redige a mensagem de um erro não capturado que cruza a
// fronteira server/client em produção.
export type BookingActionResult =
  | { booking: PublicBooking }
  | { error: string; unauthorized?: boolean };

export type WaitlistActionResult = { ok: true } | { error: string; unauthorized?: boolean };

function toError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return { error: error.statusCode === 401 ? "Sua sessão expirou. Entre novamente." : error.message, unauthorized: error.statusCode === 401 };
  }
  return { error: fallback };
}

export async function createBookingAction(
  slug: string,
  input: CreateBookingInput,
): Promise<BookingActionResult> {
  try {
    const booking = await consumerAuthedFetch<PublicBooking>(`/public/tenants/${encodeURIComponent(slug)}/bookings`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { booking };
  } catch (error) {
    return toError(error, "Não foi possível confirmar o agendamento.");
  }
}

export async function joinWaitlistAction(
  slug: string,
  input: CreateWaitlistInput,
): Promise<WaitlistActionResult> {
  try {
    await consumerAuthedFetch(`/public/tenants/${encodeURIComponent(slug)}/waitlist`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { ok: true };
  } catch (error) {
    return toError(error, "Não foi possível entrar na lista agora. Tente novamente.");
  }
}

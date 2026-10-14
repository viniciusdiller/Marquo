"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Ticket } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TicketActionResult {
  ok: boolean;
  error?: string;
  ticket?: Ticket;
}

function fail(err: unknown): TicketActionResult {
  return { ok: false, error: err instanceof ApiError ? err.message : "Erro inesperado." };
}

async function mutate(path: string, body?: unknown): Promise<TicketActionResult> {
  try {
    const ticket = await authedFetch<Ticket>(path, {
      method: body === undefined ? "POST" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    revalidatePath("/dashboard/comandas");
    if (ticket?.id) revalidatePath(`/dashboard/comandas/${ticket.id}`);
    return { ok: true, ticket };
  } catch (err) {
    return fail(err);
  }
}

export async function openTicketAction(input: {
  appointmentId?: string;
  clientId?: string;
}): Promise<TicketActionResult> {
  const result = await mutate("/tickets", input);
  if (result.ok && result.ticket) redirect(`/dashboard/comandas/${result.ticket.id}`);
  return result;
}

export async function addItemAction(id: string, body: unknown): Promise<TicketActionResult> {
  return mutate(`/tickets/${encodeURIComponent(id)}/items`, body);
}

export async function removeItemAction(id: string, itemId: string): Promise<TicketActionResult> {
  try {
    const ticket = await authedFetch<Ticket>(`/tickets/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    revalidatePath(`/dashboard/comandas/${encodeURIComponent(id)}`);
    return { ok: true, ticket };
  } catch (err) {
    return fail(err);
  }
}

export async function setDiscountAction(id: string, discountCents: number) {
  try {
    const ticket = await authedFetch<Ticket>(`/tickets/${encodeURIComponent(id)}/discount`, {
      method: "PATCH",
      body: JSON.stringify({ discountCents }),
    });
    revalidatePath(`/dashboard/comandas/${encodeURIComponent(id)}`);
    return { ok: true, ticket };
  } catch (err) {
    return fail(err);
  }
}

export async function addPaymentAction(id: string, body: unknown): Promise<TicketActionResult> {
  return mutate(`/tickets/${encodeURIComponent(id)}/payments`, body);
}

export async function closeTicketAction(id: string): Promise<TicketActionResult> {
  const result = await mutate(`/tickets/${encodeURIComponent(id)}/close`, {});
  if (result.ok) {
    revalidatePath("/dashboard/comandas");
    redirect("/dashboard/comandas");
  }
  return result;
}

export async function cancelTicketAction(id: string): Promise<TicketActionResult> {
  const result = await mutate(`/tickets/${encodeURIComponent(id)}/cancel`, {});
  if (result.ok) redirect("/dashboard/comandas");
  return result;
}

// Vincula (clientId) ou desvincula (null) o cliente da comanda aberta. Ids só passam se forem UUID
// (argumento de Server Action é controlado pelo cliente); o backend valida o tenant e o estado.
export async function setTicketClientAction(id: string, clientId: string | null): Promise<TicketActionResult> {
  if (!UUID_RE.test(id) || (clientId !== null && !UUID_RE.test(clientId))) {
    return { ok: false, error: "Dados inválidos." };
  }
  try {
    const ticket = await authedFetch<Ticket>(`/tickets/${encodeURIComponent(id)}/client`, {
      method: "PATCH",
      body: JSON.stringify({ clientId }),
    });
    revalidatePath("/dashboard/comandas");
    revalidatePath(`/dashboard/comandas/${id}`);
    return { ok: true, ticket };
  } catch (err) {
    return fail(err);
  }
}

export interface ClientOption {
  id: string;
  name: string;
  phone: string;
}

// Busca de cliente pro seletor. Mínimo de 2 caracteres e teto de tamanho (o backend ainda limita a 200
// linhas); devolve só o que o seletor mostra, não a ficha inteira.
export async function searchClientsAction(
  query: string,
): Promise<{ ok: true; clients: ClientOption[] } | { ok: false; error: string }> {
  const term = query.trim();
  if (term.length < 2) return { ok: true, clients: [] };
  if (term.length > 100) return { ok: false, error: "Busca muito longa." };
  try {
    const rows = await authedFetch<ClientOption[]>(`/clients?search=${encodeURIComponent(term)}`);
    return { ok: true, clients: rows.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: c.phone })) };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Erro ao buscar clientes." };
  }
}

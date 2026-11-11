"use server";

import { revalidatePath } from "next/cache";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";

export interface AccessActionState {
  error?: string;
}

function fail(err: unknown): AccessActionState {
  // Mensagens de domínio vêm em português do backend; o resto vira texto genérico.
  return { error: err instanceof ApiError ? err.message : "Não foi possível concluir. Tente novamente." };
}

async function run(path: string, init: RequestInit): Promise<AccessActionState> {
  try {
    await authedFetch(path, init);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard/acessos");
  return {};
}

const json = (body: unknown) => JSON.stringify(body);

export async function createProfileAction(input: {
  name: string;
  description: string;
  permissions: Record<string, string>;
}): Promise<AccessActionState> {
  return run("/access/profiles", { method: "POST", body: json(input) });
}

export async function updateProfileAction(
  id: string,
  input: { name: string; description: string; permissions: Record<string, string> },
): Promise<AccessActionState> {
  return run(`/access/profiles/${encodeURIComponent(id)}`, { method: "PATCH", body: json(input) });
}

export async function deleteProfileAction(id: string): Promise<AccessActionState> {
  return run(`/access/profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createAccessUserAction(input: {
  name: string;
  email: string;
  password: string;
  profileId: string;
}): Promise<AccessActionState> {
  return run("/access/users", { method: "POST", body: json(input) });
}

export async function updateAccessUserAction(
  id: string,
  patch: { name?: string; profileId?: string; isActive?: boolean },
): Promise<AccessActionState> {
  return run(`/access/users/${encodeURIComponent(id)}`, { method: "PATCH", body: json(patch) });
}

export async function resetAccessPasswordAction(id: string, password: string): Promise<AccessActionState> {
  return run(`/access/users/${encodeURIComponent(id)}/password`, { method: "POST", body: json({ password }) });
}

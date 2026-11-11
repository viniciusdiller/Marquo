import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AccessAreaKey, AccessLevel, AccessMe } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { canAccess, fallbackAccess } from "@/lib/access";

// Uma leitura por requisição (layout + página dividem o resultado).
export const getAccess = cache(async (): Promise<AccessMe> => {
  const session = await auth();
  if (!session || session.error) redirect("/entrar");
  try {
    return await authedFetch<AccessMe>("/access/me");
  } catch (err) {
    // redirect() do authedFetch (401) tem de propagar; qualquer outra falha cai no padrão do papel.
    if (err && typeof err === "object" && "digest" in err) throw err;
    return fallbackAccess(session.user.role);
  }
});

// Barra a página sem o nível exigido. Volta ao início do painel, que leva à primeira tela liberada.
export async function requireArea(area: AccessAreaKey, level: AccessLevel = "VIEW"): Promise<AccessMe> {
  const access = await getAccess();
  if (!canAccess(access, area, level)) redirect("/dashboard");
  return access;
}

export async function requireOwner(): Promise<AccessMe> {
  const access = await getAccess();
  if (!access.isOwner) redirect("/dashboard");
  return access;
}

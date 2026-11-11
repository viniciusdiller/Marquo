import { Prisma, Role } from "@marquo/database";
import { DEFAULT_PROFILES } from "@marquo/shared-types";
import type { PrismaService } from "../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

// Todo negócio tem os perfis padrão ("Recepção" e "Profissional"). Idempotente (upsert pela chave única tenantId+nome): pode rodar
// em cadastro, em criação de negócio pela plataforma e antes de criar um profissional, sem duplicar nada. Nunca sobrescreve um
// perfil que o dono já editou (o `update` é vazio).
export async function ensureDefaultProfiles(db: Db, tenantId: string): Promise<Record<"Recepção" | "Profissional", string>> {
  const ids: Record<string, string> = {};
  for (const profile of DEFAULT_PROFILES) {
    const row = await db.accessProfile.upsert({
      where: { tenantId_name: { tenantId, name: profile.name } },
      update: {},
      create: { tenantId, name: profile.name, description: profile.description, permissions: profile.permissions as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    ids[profile.name] = row.id;
  }
  return ids as Record<"Recepção" | "Profissional", string>;
}

// Id do perfil padrão para quem acaba de ser criado com este papel (null para o dono, que não tem perfil).
export async function defaultProfileIdForRole(db: Db, tenantId: string, role: Role): Promise<string | null> {
  const profile = DEFAULT_PROFILES.find((p) => p.role === role);
  if (!profile) return null;
  return (await ensureDefaultProfiles(db, tenantId))[profile.name];
}

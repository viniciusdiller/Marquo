import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Role } from "@marquo/database";
import { DEFAULT_PROFILES, normalizePermissions } from "@marquo/shared-types";
import { defaultProfileIdForRole, ensureDefaultProfiles } from "./default-profiles";

function dbWith() {
  const upsert = jest.fn().mockImplementation(async ({ where }: { where: { tenantId_name: { name: string } } }) => ({ id: `id-${where.tenantId_name.name}` }));
  return { db: { accessProfile: { upsert } } as never, upsert };
}

describe("ensureDefaultProfiles", () => {
  it("garante Recepção e Profissional com as permissões padrão, no negócio informado", async () => {
    const { db, upsert } = dbWith();
    const ids = await ensureDefaultProfiles(db, "t-1");
    expect(ids).toEqual({ Recepção: "id-Recepção", Profissional: "id-Profissional" });
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const profile of DEFAULT_PROFILES) {
      const call = upsert.mock.calls.find((c) => c[0].where.tenantId_name.name === profile.name)![0];
      expect(call.where).toEqual({ tenantId_name: { tenantId: "t-1", name: profile.name } });
      expect(call.create).toMatchObject({ tenantId: "t-1", name: profile.name, permissions: profile.permissions });
    }
  });

  // Nunca sobrescreve um perfil que o dono já editou: rodar de novo não desfaz o que ele configurou.
  it("é idempotente: o update é vazio, então perfil já editado pelo dono nunca é sobrescrito", async () => {
    const { db, upsert } = dbWith();
    await ensureDefaultProfiles(db, "t-1");
    await ensureDefaultProfiles(db, "t-1");
    for (const call of upsert.mock.calls) expect(call[0].update).toEqual({});
  });

  it("defaultProfileIdForRole: profissional e recepção têm perfil padrão; o dono não tem perfil", async () => {
    const { db } = dbWith();
    expect(await defaultProfileIdForRole(db, "t-1", Role.PROFESSIONAL)).toBe("id-Profissional");
    expect(await defaultProfileIdForRole(db, "t-1", Role.RECEPTIONIST)).toBe("id-Recepção");
    expect(await defaultProfileIdForRole(db, "t-1", Role.OWNER)).toBeNull();
  });
});

describe("perfis padrão: o código e a migração dizem a MESMA coisa", () => {
  // A migração cria os perfis padrão nos negócios que já existem, com o JSON gravado no SQL. Se alguém mudar DEFAULT_PROFILES e
  // esquecer de uma migração nova, negócios antigos e novos passariam a ter perfis padrão diferentes.
  const dir = join(__dirname, "../../../../packages/database/prisma/migrations");
  const migration = readdirSync(dir).find((name) => name.endsWith("_access_profiles"))!;
  const sql = readFileSync(join(dir, migration, "migration.sql"), "utf8");

  it.each(DEFAULT_PROFILES.map((p) => [p.name, p] as const))("%s: JSON da migração é idêntico a DEFAULT_PROFILES", (name, profile) => {
    const line = sql.split("\n").find((l) => l.includes(`'${name}'`) && l.includes("::jsonb"))!;
    const json = line.match(/'(\{[^']*\})'::jsonb/)![1];
    expect(normalizePermissions(JSON.parse(json))).toEqual(profile.permissions);
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(Object.keys(profile.permissions).sort());
  });

  it("a migração liga cada usuário existente ao perfil do seu papel (e nunca o dono)", () => {
    expect(sql).toMatch(/'Recepção' AND u\."role" = 'RECEPTIONIST'/);
    expect(sql).toMatch(/'Profissional' AND u\."role" = 'PROFESSIONAL'/);
    expect(sql).not.toMatch(/u\."role" = 'OWNER'/);
  });

  it("a migração é segura de repetir (ON CONFLICT) e só preenche quem ainda não tem perfil", () => {
    expect(sql.match(/ON CONFLICT \("tenantId", "name"\) DO NOTHING/g)).toHaveLength(2);
    expect(sql.match(/"accessProfileId" IS NULL/g)).toHaveLength(2);
  });
});

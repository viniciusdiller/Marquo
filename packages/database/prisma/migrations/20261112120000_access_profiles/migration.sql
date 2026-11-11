-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessProfileId" TEXT;

-- CreateTable
CREATE TABLE "AccessProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AccessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessProfile_tenantId_name_key" ON "AccessProfile"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accessProfileId_fkey" FOREIGN KEY ("accessProfileId") REFERENCES "AccessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessProfile" ADD CONSTRAINT "AccessProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Perfis padrão em TODOS os negócios existentes (iguais ao que cada papel já podia fazer antes dos perfis: nada muda até o dono mexer).
-- O JSON vem de DEFAULT_PROFILES (shared-types); access-profiles-migration.spec.ts confere que continuam idênticos.
INSERT INTO "AccessProfile" ("id", "tenantId", "name", "description", "permissions", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Recepção', 'Atendimento do dia a dia: agenda, comandas, caixa e clientes.', '{"agenda":"EDIT","comandas":"EDIT","caixa":"EDIT","lista_espera":"EDIT","clientes":"EDIT","fichas":"VIEW","clube":"NONE","servicos":"VIEW","produtos":"EDIT","profissionais":"VIEW","comissoes":"NONE","financeiro":"EDIT","financeiro_avancado":"NONE","relatorios":"VIEW","marketplace":"NONE"}'::jsonb, now(), now()
FROM "Tenant" t
ON CONFLICT ("tenantId", "name") DO NOTHING;

INSERT INTO "AccessProfile" ("id", "tenantId", "name", "description", "permissions", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Profissional', 'Quem atende: a própria agenda, fichas e o catálogo para consulta.', '{"agenda":"EDIT","comandas":"NONE","caixa":"NONE","lista_espera":"NONE","clientes":"NONE","fichas":"VIEW","clube":"NONE","servicos":"VIEW","produtos":"NONE","profissionais":"VIEW","comissoes":"NONE","financeiro":"NONE","financeiro_avancado":"NONE","relatorios":"NONE","marketplace":"NONE"}'::jsonb, now(), now()
FROM "Tenant" t
ON CONFLICT ("tenantId", "name") DO NOTHING;

UPDATE "User" u SET "accessProfileId" = ap."id"
FROM "AccessProfile" ap
WHERE ap."tenantId" = u."tenantId" AND ap."name" = 'Recepção' AND u."role" = 'RECEPTIONIST' AND u."accessProfileId" IS NULL;

UPDATE "User" u SET "accessProfileId" = ap."id"
FROM "AccessProfile" ap
WHERE ap."tenantId" = u."tenantId" AND ap."name" = 'Profissional' AND u."role" = 'PROFESSIONAL' AND u."accessProfileId" IS NULL;


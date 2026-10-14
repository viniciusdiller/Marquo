-- O commit 30945a9 adicionou estes campos ao schema.prisma sem migration: o banco ficava sem as
-- colunas e toda rota autenticada (TenantBillingGuard lê o Tenant) respondia 409 genérico.
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "maxSchedulingLeadTimeDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minSchedulingLeadTimeMinutes" INTEGER NOT NULL DEFAULT 120;

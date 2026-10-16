-- Painel da plataforma: suspensão manual de negócio + contexto na trilha de auditoria.
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "suspendedAt" TIMESTAMPTZ(6),
ADD COLUMN     "suspendedReason" TEXT;

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN     "detail" TEXT;

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

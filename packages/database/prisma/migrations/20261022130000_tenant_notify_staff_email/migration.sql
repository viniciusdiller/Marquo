-- Dono escolhe se a equipe recebe os avisos de agendamento por e-mail (padrão: sim).
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "notifyStaffByEmail" BOOLEAN NOT NULL DEFAULT true;

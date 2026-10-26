-- Marca o negócio cujos dados foram apagados (linha anonimizada, com os registros de pagamento mantidos).
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6);

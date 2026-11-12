-- Asaas: cada tentativa guarda o cliente criado no provedor (liga a assinatura que o checkout
-- hospedado cria ao negócio certo).
-- AlterTable
ALTER TABLE "BillingAttempt" ADD COLUMN     "providerCustomerId" TEXT;

-- CreateIndex
CREATE INDEX "BillingAttempt_providerCustomerId_idx" ON "BillingAttempt"("providerCustomerId");

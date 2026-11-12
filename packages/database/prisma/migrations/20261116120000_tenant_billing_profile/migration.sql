-- Dados de cobrança do negócio (CPF/CNPJ criptografado, telefone e endereço do pagador) para o checkout do Asaas.
-- CreateTable
CREATE TABLE "TenantBillingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentEnc" TEXT,
    "documentHint" TEXT,
    "phone" TEXT,
    "postalCode" TEXT,
    "address" TEXT,
    "addressNumber" TEXT,
    "complement" TEXT,
    "province" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantBillingProfile_tenantId_key" ON "TenantBillingProfile"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantBillingProfile" ADD CONSTRAINT "TenantBillingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mercado Pago: tentativas de pagamento (cartão recorrente e Pix mensal) e forma de pagamento da assinatura.
-- CreateEnum
CREATE TYPE "BillingMethod" AS ENUM ('CARD_RECURRING', 'PIX_MONTHLY');

-- CreateEnum
CREATE TYPE "BillingAttemptStatus" AS ENUM ('PENDING', 'APPROVED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "CouponRedemption" ADD COLUMN     "appliedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "method" "BillingMethod",
ADD COLUMN     "providerSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "BillingAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "method" "BillingMethod" NOT NULL,
    "status" "BillingAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "listPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "chargeCents" INTEGER NOT NULL,
    "couponRedemptionId" TEXT,
    "couponReserved" BOOLEAN NOT NULL DEFAULT false,
    "providerRef" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BillingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAttempt_providerRef_key" ON "BillingAttempt"("providerRef");

-- CreateIndex
CREATE INDEX "BillingAttempt_tenantId_status_idx" ON "BillingAttempt"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BillingAttempt_status_expiresAt_idx" ON "BillingAttempt"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- AddForeignKey
ALTER TABLE "BillingAttempt" ADD CONSTRAINT "BillingAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAttempt" ADD CONSTRAINT "BillingAttempt_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


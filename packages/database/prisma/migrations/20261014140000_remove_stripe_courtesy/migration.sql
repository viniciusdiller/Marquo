-- Stripe removido (o Mercado Pago entra depois). A Subscription deixa de depender de ids do provedor e
-- ganha `courtesy` (acesso concedido pela plataforma, sem cobrança).
-- DropIndex
DROP INDEX "Plan_stripePriceId_key";

-- DropIndex
DROP INDEX "Subscription_stripeSubscriptionId_key";

-- DropIndex
DROP INDEX "Tenant_stripeCustomerId_key";

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "stripePriceId";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeSubscriptionId",
ADD COLUMN     "courtesy" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "stripeCustomerId";

-- DropTable
DROP TABLE "StripeEvent";

-- Troca para plano mais caro no meio do período: a diferença proporcional é cobrada por uma tentativa própria (PLAN_UPGRADE)
-- e o plano só muda quando o pagamento é confirmado.
-- CreateEnum
CREATE TYPE "BillingAttemptKind" AS ENUM ('SUBSCRIPTION', 'PLAN_UPGRADE');

-- AlterTable
ALTER TABLE "BillingAttempt" ADD COLUMN     "kind" "BillingAttemptKind" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "fromPlanId" TEXT;

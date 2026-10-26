-- Confirmação de e-mail do dono no cadastro público.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationExpiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "emailVerificationTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationTokenHash_key" ON "User"("emailVerificationTokenHash");

-- Contas que já existem ficam como confirmadas: não há negócio real ainda, e exigir confirmação retroativa
-- trancaria para fora quem já entra hoje (inclusive o dono de teste).
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

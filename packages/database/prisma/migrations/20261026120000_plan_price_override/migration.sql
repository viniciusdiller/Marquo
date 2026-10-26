-- Preço rebaixado pela plataforma (nulo = vale o do catálogo). O sync do boot o reaplica em "priceCents".
-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "priceOverrideCents" INTEGER;

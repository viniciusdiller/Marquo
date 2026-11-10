-- CreateEnum
CREATE TYPE "ClubMembershipStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- AlterEnum
ALTER TYPE "FinancialEntrySource" ADD VALUE 'CLUB';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "clubEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "clubCoveredCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClubPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "usesPerMonth" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClubPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPlanService" (
    "clubPlanId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "ClubPlanService_pkey" PRIMARY KEY ("clubPlanId","serviceId")
);

-- CreateTable
CREATE TABLE "ClubMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clubPlanId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "ClubMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "usesPerMonth" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "canceledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketItemId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "units" INTEGER NOT NULL,
    "coveredCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubPlan_tenantId_isActive_idx" ON "ClubPlan"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ClubPlanService_serviceId_idx" ON "ClubPlanService"("serviceId");

-- CreateIndex
CREATE INDEX "ClubMembership_tenantId_status_idx" ON "ClubMembership"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClubMembership_clientId_status_idx" ON "ClubMembership"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubUsage_ticketItemId_key" ON "ClubUsage"("ticketItemId");

-- CreateIndex
CREATE INDEX "ClubUsage_membershipId_periodStart_idx" ON "ClubUsage"("membershipId", "periodStart");

-- CreateIndex
CREATE INDEX "ClubUsage_ticketId_idx" ON "ClubUsage"("ticketId");

-- AddForeignKey
ALTER TABLE "ClubPlan" ADD CONSTRAINT "ClubPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPlanService" ADD CONSTRAINT "ClubPlanService_clubPlanId_fkey" FOREIGN KEY ("clubPlanId") REFERENCES "ClubPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPlanService" ADD CONSTRAINT "ClubPlanService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubPlanId_fkey" FOREIGN KEY ("clubPlanId") REFERENCES "ClubPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ClubMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubUsage" ADD CONSTRAINT "ClubUsage_ticketItemId_fkey" FOREIGN KEY ("ticketItemId") REFERENCES "TicketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Um cliente só pode ter UMA adesão ativa por negócio (índice único PARCIAL: o Prisma não consegue declará-lo no schema,
-- então vive só aqui, como a constraint de overlap do Appointment). Cancelada/histórica pode repetir.
CREATE UNIQUE INDEX "ClubMembership_one_active_per_client" ON "ClubMembership"("tenantId", "clientId") WHERE "status" = 'ACTIVE';

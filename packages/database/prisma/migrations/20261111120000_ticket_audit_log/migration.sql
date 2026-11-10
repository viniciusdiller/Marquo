-- CreateEnum
CREATE TYPE "TicketAuditAction" AS ENUM ('ITEM_UPDATED', 'PAYMENT_REMOVED', 'REOPENED');

-- CreateTable
CREATE TABLE "TicketAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" "TicketAuditAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketAuditLog_ticketId_createdAt_idx" ON "TicketAuditLog"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAuditLog_tenantId_createdAt_idx" ON "TicketAuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketAuditLog" ADD CONSTRAINT "TicketAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAuditLog" ADD CONSTRAINT "TicketAuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "appointmentVersion" INTEGER NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMPTZ(6),
  "lockToken" TEXT,
  "firstAttemptAt" TIMESTAMPTZ(6),
  "sentAt" TIMESTAMPTZ(6),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationOutbox_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationOutbox_deduplicationKey_key" ON "NotificationOutbox"("deduplicationKey");
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");
CREATE INDEX "NotificationOutbox_appointmentId_event_appointmentVersion_idx" ON "NotificationOutbox"("appointmentId", "event", "appointmentVersion");
CREATE INDEX "NotificationOutbox_tenantId_createdAt_idx" ON "NotificationOutbox"("tenantId", "createdAt");

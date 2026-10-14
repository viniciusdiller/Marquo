-- CreateIndex
CREATE INDEX "Client_tenantId_name_idx" ON "Client"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_status_closedAt_idx" ON "Ticket"("tenantId", "status", "closedAt");

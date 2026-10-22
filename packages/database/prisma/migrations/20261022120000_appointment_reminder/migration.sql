-- Lembrete de agendamento por e-mail: marca quando o lembrete foi enviado (ou dispensado).
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

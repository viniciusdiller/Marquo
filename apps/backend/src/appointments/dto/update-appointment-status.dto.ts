import { IsIn } from "class-validator";
import { AppointmentStatus } from "@marquo/database";

// Só os estados que a recepção seta manualmente. CANCELED tem endpoint próprio
// (mantém o mesmo caminho do fluxo por token) e SCHEDULED/PUBLIC não são destino manual.
export const STAFF_SETTABLE_STATUSES = [
  "CONFIRMED",
  "IN_SERVICE",
  "COMPLETED",
  "NO_SHOW",
] as const satisfies ReadonlyArray<AppointmentStatus>;

export class UpdateAppointmentStatusDto {
  @IsIn(STAFF_SETTABLE_STATUSES)
  status!: (typeof STAFF_SETTABLE_STATUSES)[number];
}

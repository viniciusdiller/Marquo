import type { AppointmentStatus } from "@marquo/shared-types";

// Fonte única de verdade pra cor/label de status de agendamento — antes AgendaView.tsx
// (cor do bloco) e AppointmentPanel.tsx (label, sem cor nenhuma) reinventavam isso cada
// um do seu jeito, e discordavam entre si (o painel mostrava sempre cinza neutro,
// mesmo com o bloco do grid colorido por status).
export const APPOINTMENT_STATUS_ORDER: AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "IN_SERVICE",
  "COMPLETED",
  "NO_SHOW",
  "CANCELED",
];

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Pendente",
  CONFIRMED: "Confirmado",
  IN_SERVICE: "Em atendimento",
  COMPLETED: "Finalizado",
  NO_SHOW: "Faltou",
  CANCELED: "Cancelado",
};

// Bloco no grid da agenda (borda + fundo + texto, com line-through pros estados terminais).
export const STATUS_BLOCK_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  CONFIRMED:
    "border-accent-300 bg-accent-50 text-accent-800 dark:border-accent-500/40 dark:bg-accent-500/10 dark:text-accent-200",
  IN_SERVICE:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  COMPLETED:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  NO_SHOW:
    "border-zinc-300 bg-zinc-100 text-zinc-500 line-through dark:border-white/15 dark:bg-white/5",
  CANCELED:
    "border-zinc-200 bg-zinc-50 text-zinc-400 line-through dark:border-white/10 dark:bg-white/[0.03]",
};

// Pill/badge (painel de detalhe) — mesma paleta do bloco, sem borda/line-through.
export const STATUS_BADGE_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  CONFIRMED: "bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300",
  IN_SERVICE: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
  COMPLETED: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  NO_SHOW: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-stone-400",
  CANCELED: "bg-zinc-50 text-zinc-400 dark:bg-white/[0.03] dark:text-stone-500",
};

// Bolinha sólida — legenda da agenda e preview de cor no diálogo de criar.
export const STATUS_DOT_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-amber-400",
  CONFIRMED: "bg-accent-500",
  IN_SERVICE: "bg-sky-400",
  COMPLETED: "bg-emerald-500",
  NO_SHOW: "bg-zinc-400",
  CANCELED: "bg-zinc-300",
};

const UNKNOWN_BLOCK =
  "border-dashed border-zinc-400 bg-zinc-100 text-zinc-500 dark:border-white/30 dark:bg-white/10 dark:text-stone-300";
const UNKNOWN_BADGE =
  "bg-zinc-100 text-zinc-500 ring-1 ring-dashed ring-zinc-300 dark:bg-white/10 dark:text-stone-300";
const UNKNOWN_DOT = "bg-zinc-400";

function isKnownStatus(status: string): status is AppointmentStatus {
  return status in STATUS_LABEL;
}

// Status desconhecido (dado inconsistente, enum novo ainda não mapeado aqui) nunca deve
// se passar silenciosamente por CONFIRMED — melhor um visual visivelmente "estranho"
// (borda tracejada) do que esconder um bug de dado.
export function getStatusLabel(status: string): string {
  return isKnownStatus(status) ? STATUS_LABEL[status] : `Status desconhecido (${status})`;
}

export function getStatusBlockClasses(status: string): string {
  return isKnownStatus(status) ? STATUS_BLOCK_CLASSES[status] : UNKNOWN_BLOCK;
}

export function getStatusBadgeClasses(status: string): string {
  return isKnownStatus(status) ? STATUS_BADGE_CLASSES[status] : UNKNOWN_BADGE;
}

export function getStatusDotClasses(status: string): string {
  return isKnownStatus(status) ? STATUS_DOT_CLASSES[status] : UNKNOWN_DOT;
}

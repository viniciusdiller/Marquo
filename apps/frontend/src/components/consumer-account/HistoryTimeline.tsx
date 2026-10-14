import Link from "next/link";
import { DateTime } from "luxon";
import type { PublicBooking } from "@marquo/shared-types";

const TIMEZONE = "America/Sao_Paulo";

const STATUS: Record<string, { label: string; className: string }> = {
  COMPLETED: {
    label: "Concluído",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  CONFIRMED: {
    label: "Realizado",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  CANCELED: {
    label: "Cancelado",
    className: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-stone-400",
  },
  NO_SHOW: {
    label: "Faltou",
    className: "bg-(--tenant-accent-secondary)/10 text-(--tenant-accent-secondary)",
  },
};

function statusOf(status: string) {
  return STATUS[status] ?? STATUS.CONFIRMED;
}

// Agrupa por mês (fuso do salão), preservando a ordem recebida do backend (mais recente antes).
function groupByMonth(bookings: PublicBooking[]) {
  const groups: Array<{ key: string; label: string; items: PublicBooking[] }> = [];
  for (const booking of bookings) {
    const dt = DateTime.fromISO(booking.startAt).setZone(TIMEZONE).setLocale("pt-BR");
    const key = dt.toFormat("yyyy-LL");
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dt.toFormat("LLLL 'de' yyyy"), items: [] };
      groups.push(group);
    }
    group.items.push(booking);
  }
  return groups;
}

// Histórico como linha do tempo por mês: só leitura, uma linha por visita. O que exige ação
// (remarcar/cancelar) fica nos ingressos de "Próximos".
export function HistoryTimeline({ bookings }: { bookings: PublicBooking[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groupByMonth(bookings).map((group) => (
        <section key={group.key}>
          <h3 className="text-xs font-bold tracking-[0.16em] text-zinc-500 uppercase dark:text-stone-400">
            {group.label}
          </h3>
          <ol className="mt-3 border-l border-zinc-200 dark:border-white/10">
            {group.items.map((booking) => {
              const dt = DateTime.fromISO(booking.startAt).setZone(TIMEZONE).setLocale("pt-BR");
              const status = statusOf(booking.status);
              return (
                <li key={booking.id} className="animate-rise-in relative flex items-center gap-4 py-3 pl-6">
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-300 dark:bg-white/20"
                  />
                  <div className="w-12 shrink-0 text-center">
                    <p className="font-brand text-2xl leading-none tabular-nums text-zinc-900 dark:text-white">
                      {dt.toFormat("d")}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-zinc-500 capitalize dark:text-stone-400">
                      {dt.toFormat("ccc").replace(".", "")}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-zinc-900 dark:text-white">
                      {booking.service?.name}
                    </p>
                    <p className="truncate text-sm text-zinc-500 dark:text-stone-400">
                      {booking.tenant ? (
                        <Link
                          href={`/${booking.tenant.slug}`}
                          className="hover:text-(--tenant-accent) hover:underline"
                        >
                          {booking.tenant.name}
                        </Link>
                      ) : null}
                      <span className="tabular-nums"> · {dt.toFormat("HH:mm")}</span>
                    </p>
                  </div>

                  <span
                    className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${status.className}`}
                  >
                    {status.label}
                  </span>
                  {booking.tenant ? (
                    <Link
                      href={`/${booking.tenant.slug}/agendar`}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-(--tenant-accent) hover:bg-(--tenant-accent)/10"
                    >
                      Agendar de novo
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

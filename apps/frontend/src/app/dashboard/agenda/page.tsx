import { DateTime } from "luxon";
import type { CalendarResponse, TenantSetupStatus } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { AgendaView } from "./AgendaView";
import { fetchCalendarAction } from "./actions";

const TIMEZONE = "America/Sao_Paulo";

interface AgendaService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  isActive: boolean;
}

export default async function AgendaPage() {
  const session = await auth();
  const today = DateTime.now().setZone(TIMEZONE).toISODate()!;
  const from = DateTime.fromISO(today, { zone: TIMEZONE }).startOf("day").toISO()!;
  const to = DateTime.fromISO(today, { zone: TIMEZONE }).endOf("day").toISO()!;

  const isOwner = session?.user.role === "OWNER";
  const emptyCalendar: CalendarResponse = { professionals: [], appointments: [], timeBlocks: [] };
  const [calendarResult, services, setupStatus] = await Promise.all([
    fetchCalendarAction(from, to)
      .then((data) => ({ data, error: false }))
      // Sem isso, qualquer erro (sessão expirada, trial vencido, 500) virava silenciosamente
      // "nenhum profissional ativo" — o dono não tinha nenhuma pista do motivo real.
      .catch(() => ({ data: emptyCalendar, error: true })),
    authedFetch<AgendaService[]>("/services").catch(() => [] as AgendaService[]),
    isOwner
      ? authedFetch<TenantSetupStatus>("/tenants/me/setup-status").catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <AgendaView
      initialDate={today}
      initialCalendar={calendarResult.data}
      initialLoadError={calendarResult.error}
      services={services.filter((s) => s.isActive)}
      role={session?.user.role ?? "PROFESSIONAL"}
      setupStatus={setupStatus}
    />
  );
}

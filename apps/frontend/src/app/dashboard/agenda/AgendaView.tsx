"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { CaretLeft, CaretRight, Plus, Users, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { HowItWorks } from "@/components/ui/HowItWorks";
import type {
  CalendarResponse,
  PublicBooking,
  StaffRole,
} from "@marquo/shared-types";
import { fetchCalendarAction } from "./actions";
import { AppointmentPanel } from "./AppointmentPanel";
import { CreateAppointmentDialog } from "./CreateAppointmentDialog";
import {
  APPOINTMENT_STATUS_ORDER,
  getStatusBlockClasses,
  getStatusDotClasses,
  getStatusLabel,
} from "@/lib/appointment-status";

const TIMEZONE = "America/Sao_Paulo";
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const PX_PER_MIN = 1.1;
const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

interface AgendaService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

function minutesFromDayStart(iso: string, day: string) {
  const dayStart = DateTime.fromISO(day, { zone: TIMEZONE }).startOf("day");
  return DateTime.fromISO(iso).setZone(TIMEZONE).diff(dayStart, "minutes").minutes;
}

const GRID_TOP_MIN = DAY_START_HOUR * 60;
const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 60 * PX_PER_MIN;

export function AgendaView({
  initialDate,
  initialCalendar,
  initialLoadError = false,
  services,
  role,
}: {
  initialDate: string;
  initialCalendar: CalendarResponse;
  initialLoadError?: boolean;
  services: AgendaService[];
  role: StaffRole;
}) {
  const [date, setDate] = useState(initialDate);
  const [calendar, setCalendar] = useState(initialCalendar);
  const [loadError, setLoadError] = useState(initialLoadError);
  const [professionalFilter, setProfessionalFilter] = useState<string>("");
  // O backend devolve só o profissional filtrado; a lista do seletor vem da última carga sem filtro,
  // senão o seletor sumia (ou perdia as opções) assim que alguém era escolhido.
  const [filterOptions, setFilterOptions] = useState(() =>
    initialCalendar.professionals.map((p) => ({ id: p.id, name: p.name })),
  );
  const [selected, setSelected] = useState<PublicBooking | null>(null);
  const [createAt, setCreateAt] = useState<{ professionalId: string; startAt: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = role === "OWNER" || role === "RECEPTIONIST" || role === "PROFESSIONAL";

  const reload = useCallback(
    (nextDate: string, nextFilter: string) => {
      const from = DateTime.fromISO(nextDate, { zone: TIMEZONE }).startOf("day").toISO()!;
      const to = DateTime.fromISO(nextDate, { zone: TIMEZONE }).endOf("day").toISO()!;
      startTransition(async () => {
        // Sem o try/catch, uma falha aqui (sessão expirada, trial vencido no meio do uso,
        // erro de rede) derrubava a agenda inteira pro error boundary genérico do Next.
        try {
          const data = await fetchCalendarAction(from, to, nextFilter || undefined);
          setCalendar(data);
          if (!nextFilter) {
            setFilterOptions(data.professionals.map((p) => ({ id: p.id, name: p.name })));
          }
          setLoadError(false);
        } catch {
          setLoadError(true);
        }
        setSelected(null);
      });
    },
    [],
  );

  function shiftDay(days: number) {
    const next = DateTime.fromISO(date, { zone: TIMEZONE }).plus({ days }).toISODate()!;
    setDate(next);
    reload(next, professionalFilter);
  }

  function goToday() {
    const today = DateTime.now().setZone(TIMEZONE).toISODate()!;
    setDate(today);
    reload(today, professionalFilter);
  }

  const weekday = WEEKDAYS[DateTime.fromISO(date, { zone: TIMEZONE }).weekday % 7];

  const columns = useMemo(
    () =>
      calendar.professionals.filter(
        (p) => !professionalFilter || p.id === professionalFilter,
      ),
    [calendar.professionals, professionalFilter],
  );

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) list.push(h);
    return list;
  }, []);

  function handleColumnClick(professionalId: string, event: React.MouseEvent<HTMLDivElement>) {
    if (!canManage) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetMin = (event.clientY - rect.top) / PX_PER_MIN;
    const snapped = Math.round((GRID_TOP_MIN + offsetMin) / 15) * 15;
    const startAt = DateTime.fromISO(date, { zone: TIMEZONE })
      .startOf("day")
      .plus({ minutes: snapped })
      .toISO()!;
    setCreateAt({ professionalId, startAt });
  }

  const prettyDate = DateTime.fromISO(date, { zone: TIMEZONE })
    .setLocale("pt-BR")
    .toFormat("cccc, d 'de' LLLL");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-4 xl:col-span-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agenda</h1>
            <p className="mt-1 text-sm text-zinc-500 capitalize dark:text-stone-400">{prettyDate}</p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border border-zinc-300 dark:border-white/15">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                className="flex-1 p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                aria-label="Dia anterior"
              >
                <CaretLeft size={16} className="mx-auto" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="border-x border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-white/15 dark:text-stone-200"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => shiftDay(1)}
                className="flex-1 p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                aria-label="Próximo dia"
              >
                <CaretRight size={16} className="mx-auto" />
              </button>
            </div>

            {filterOptions.length > 1 ? (
              <select
                value={professionalFilter}
                onChange={(e) => {
                  setProfessionalFilter(e.target.value);
                  reload(date, e.target.value);
                }}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
              >
                <option value="">Todos os profissionais</option>
                {filterOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>



          {canManage ? (
            <button
              type="button"
              onClick={() => {
                const first = columns[0];
                if (!first) return;
                setCreateAt({
                  professionalId: first.id,
                  startAt: DateTime.fromISO(date, { zone: TIMEZONE })
                    .startOf("day")
                    .plus({ hours: 9 })
                    .toISO()!,
                });
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
            >
              <Plus size={16} weight="bold" />
              Novo atendimento
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col lg:col-span-8 xl:col-span-9">
          {loadError ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <p className="flex items-center gap-2">
                <WarningCircle size={18} />
                Não foi possível carregar a agenda deste dia.
              </p>
              <button
                type="button"
                onClick={() => reload(date, professionalFilter)}
                className="rounded-md text-sm font-semibold text-red-700 underline hover:opacity-80 dark:text-red-300"
              >
                Tentar novamente
              </button>
            </div>
          ) : columns.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum profissional ativo"
              description="Cadastre profissionais pra usar a agenda."
              action={
                <Button href="/dashboard/profissionais" variant="ghost" className="px-5 py-2.5 text-sm">
                  Cadastrar profissionais
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-stone-400">
                {APPOINTMENT_STATUS_ORDER.map((status) => (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <span className={clsx("h-2 w-2 rounded-full", getStatusDotClasses(status))} />
                    {getStatusLabel(status)}
                  </span>
                ))}
              </div>
              <div
                className={clsx(
                  "overflow-x-auto rounded-2xl border border-zinc-200 dark:border-white/10",
                  isPending && "opacity-60",
                )}
              >
                <div className="flex min-w-max">
                  {/* Gutter de horas */}
                  <div className="w-14 shrink-0 border-r border-zinc-200 dark:border-white/10">
                    <div className="h-10 border-b border-zinc-200 dark:border-white/10" />
                    <div className="relative" style={{ height: GRID_HEIGHT }}>
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="absolute right-2 -translate-y-1/2 text-xs text-zinc-400"
                          style={{ top: (h * 60 - GRID_TOP_MIN) * PX_PER_MIN }}
                        >
                          {String(h).padStart(2, "0")}h
                        </div>
                      ))}
                    </div>
                  </div>

                  {columns.map((professional) => {
                    const dayHours = professional.workingHours.filter((w) => w.weekday === weekday);
                    const appts = calendar.appointments.filter(
                      (a) => a.professionalId === professional.id,
                    );
                    const blocks = calendar.timeBlocks.filter(
                      (b) => b.professionalId === professional.id,
                    );

                    return (
                      <div
                        key={professional.id}
                        className="w-56 shrink-0 border-r border-zinc-200 last:border-r-0 dark:border-white/10"
                      >
                        <div className="flex h-10 items-center justify-center border-b border-zinc-200 px-2 text-sm font-medium text-zinc-900 dark:border-white/10 dark:text-white">
                          <span className="truncate">{professional.name}</span>
                        </div>

                        <div
                          className="relative bg-zinc-50/50 dark:bg-white/[0.015]"
                          style={{ height: GRID_HEIGHT }}
                          onClick={(e) => handleColumnClick(professional.id, e)}
                          title={canManage ? "Clique num horário livre para agendar" : undefined}
                        >
                          {/* Faixas de horário de trabalho */}
                          {dayHours.map((w, i) => (
                            <div
                              key={i}
                              className="absolute inset-x-0 bg-white dark:bg-white/[0.03]"
                              style={{
                                top: (w.startMinute - GRID_TOP_MIN) * PX_PER_MIN,
                                height: (w.endMinute - w.startMinute) * PX_PER_MIN,
                              }}
                            />
                          ))}

                          {/* Linhas de hora */}
                          {hours.map((h) => (
                            <div
                              key={h}
                              className="absolute inset-x-0 border-t border-zinc-200/70 dark:border-white/5"
                              style={{ top: (h * 60 - GRID_TOP_MIN) * PX_PER_MIN }}
                            />
                          ))}

                          {/* Bloqueios */}
                          {blocks.map((b) => {
                            const top = (minutesFromDayStart(b.startAt, date) - GRID_TOP_MIN) * PX_PER_MIN;
                            const height =
                              (minutesFromDayStart(b.endAt, date) -
                                minutesFromDayStart(b.startAt, date)) *
                              PX_PER_MIN;
                            return (
                              <div
                                key={b.id}
                                className="absolute inset-x-1 rounded-md bg-[repeating-linear-gradient(45deg,rgba(120,120,120,0.15)_0_6px,transparent_6px_12px)] px-2 py-1 text-[11px] text-zinc-500"
                                style={{ top, height }}
                              >
                                {b.reason ?? "Bloqueado"}
                              </div>
                            );
                          })}

                          {/* Atendimentos */}
                          {appts.map((a) => {
                            const top = (minutesFromDayStart(a.startAt, date) - GRID_TOP_MIN) * PX_PER_MIN;
                            const durationMin =
                              minutesFromDayStart(a.endAt, date) - minutesFromDayStart(a.startAt, date);
                            const naturalHeight = durationMin * PX_PER_MIN;
                            // Piso de 26px é só legibilidade (cabe a primeira linha) — não tenta
                            // "corrigir" a duração visualmente, por isso atendimentos curtos ganham o
                            // texto de duração explícito abaixo em vez de depender só da altura.
                            const height = Math.max(26, naturalHeight);
                            const isCompact = naturalHeight < 26;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(a);
                                }}
                                className={clsx(
                                  "absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1 text-left text-[11px] leading-tight",
                                  "transition-[filter,box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-md hover:brightness-95 dark:hover:brightness-125",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current",
                                  getStatusBlockClasses(a.status),
                                )}
                                style={{ top, height }}
                              >
                                {isCompact ? (
                                  <span className="block truncate font-semibold">
                                    {DateTime.fromISO(a.startAt).setZone(TIMEZONE).toFormat("HH:mm")}{" "}
                                    {a.clientName} · {durationMin}min
                                  </span>
                                ) : (
                                  <>
                                    <span className="block font-semibold">
                                      {DateTime.fromISO(a.startAt).setZone(TIMEZONE).toFormat("HH:mm")}{" "}
                                      {a.clientName}
                                    </span>
                                    <span className="block truncate opacity-80">
                                      {a.items?.map((i) => i.serviceName).join(", ") ?? a.service?.name}
                                    </span>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <AppointmentPanel
          appointment={selected}
          professionals={calendar.professionals}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={() => reload(date, professionalFilter)}
        />
      ) : null}

      {createAt ? (
        <CreateAppointmentDialog
          professionals={calendar.professionals}
          services={services}
          defaultProfessionalId={createAt.professionalId}
          defaultStartAt={createAt.startAt}
          onClose={() => setCreateAt(null)}
          onCreated={() => {
            setCreateAt(null);
            reload(date, professionalFilter);
          }}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { DateTime } from "luxon";
import { CalendarBlank, CaretLeft, CaretRight, Plus, Users, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  CalendarResponse,
  TenantSetupStatus,
  PublicBooking,
} from "@marquo/shared-types";
import { fetchCalendarAction } from "./actions";
import { AppointmentPanel } from "./AppointmentPanel";
import { CreateAppointmentDialog } from "./CreateAppointmentDialog";
import { SetupGuide } from "@/components/dashboard/SetupGuide";
import {
  APPOINTMENT_STATUS_ORDER,
  getStatusAccentClasses,
  getStatusBlockClasses,
  getStatusDotClasses,
  getStatusLabel,
} from "@/lib/appointment-status";

const TIMEZONE = "America/Sao_Paulo";
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
// 1,5 px/min: um atendimento de 40 min tem 60 px, o bastante para horário, cliente e serviço.
const PX_PER_MIN = 1.5;
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
const HEADER_HEIGHT = "h-14";

// Minuto atual como store externa: o servidor devolve null (sem linha de "agora" no HTML inicial, evitando divergência de
// hidratação) e o navegador passa a atualizar a cada 30 s.
function subscribeMinute(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}
const currentMinuteKey = () => Math.floor(Date.now() / 60_000);
const serverMinuteKey = () => null;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AgendaView({
  initialDate,
  initialCalendar,
  initialLoadError = false,
  services,
  canEdit,
  setupStatus,
}: {
  initialDate: string;
  initialCalendar: CalendarResponse;
  initialLoadError?: boolean;
  services: AgendaService[];
  canEdit: boolean;
  setupStatus?: TenantSetupStatus | null;
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

  const gridRef = useRef<HTMLDivElement>(null);
  // Ao abrir e ao trocar de dia, a grade rola até o que importa (agora, ou o primeiro atendimento) em vez de começar às 7h.
  const scrollPending = useRef(true);
  const minuteKey = useSyncExternalStore(subscribeMinute, currentMinuteKey, serverMinuteKey);

  // Quem pode mexer vem do perfil de acesso ("Ver e editar" na Agenda); o servidor confere de novo.
  const canManage = canEdit;

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
    scrollPending.current = true;
    setDate(next);
    reload(next, professionalFilter);
  }

  function goToday() {
    const today = DateTime.now().setZone(TIMEZONE).toISODate()!;
    scrollPending.current = true;
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

  const today = DateTime.now().setZone(TIMEZONE).toISODate();
  const isToday = date === today;
  // Minutos desde 00:00 de "agora" (só no dia de hoje e já no navegador); fora do expediente da grade, sem linha.
  const nowMinutes =
    isToday && minuteKey !== null
      ? (() => {
          const n = DateTime.now().setZone(TIMEZONE);
          return n.hour * 60 + n.minute;
        })()
      : null;
  const nowVisible = nowMinutes !== null && nowMinutes >= GRID_TOP_MIN && nowMinutes <= DAY_END_HOUR * 60;

  const visibleAppointments = useMemo(
    () => calendar.appointments.filter((a) => columns.some((c) => c.id === a.professionalId)),
    [calendar.appointments, columns],
  );
  const activeCount = visibleAppointments.filter((a) => a.status !== "CANCELED").length;
  const pendingCount = visibleAppointments.filter((a) => a.status === "SCHEDULED").length;

  useEffect(() => {
    const el = gridRef.current;
    if (!el || !scrollPending.current) return;
    scrollPending.current = false;
    let focusMinute = 9 * 60;
    if (isToday && nowMinutes !== null) focusMinute = nowMinutes;
    else if (visibleAppointments.length > 0) {
      focusMinute = Math.min(...visibleAppointments.map((a) => minutesFromDayStart(a.startAt, date)));
    }
    el.scrollTop = Math.max(0, (focusMinute - GRID_TOP_MIN) * PX_PER_MIN - 96);
  }, [calendar, date, isToday, nowMinutes, visibleAppointments]);

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

  const rawDate = DateTime.fromISO(date, { zone: TIMEZONE }).setLocale("pt-BR").toFormat("cccc, d 'de' LLLL");
  // Só a primeira letra maiúscula ("Terça-feira, 10 de novembro"); o `capitalize` do CSS deixava "De" e "Novembro" em caixa alta.
  const prettyDate = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  return (
    <div className="mx-auto w-full max-w-7xl">
      {setupStatus && !setupStatus.isFullySetup && setupStatus.completedStepsCount < setupStatus.totalStepsCount ? (
        <SetupGuide setup={setupStatus} />
      ) : null}

      {/* Barra de cima: o dia (com resumo) à esquerda, navegação, filtro e ação principal à direita. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agenda</h1>
            {isToday ? (
              <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 dark:bg-accent-500/15 dark:text-accent-200">
                Hoje
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">{prettyDate}</p>
          {!loadError && columns.length > 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-stone-300">
              <strong className="font-semibold text-zinc-900 dark:text-white">{activeCount}</strong>{" "}
              {activeCount === 1 ? "atendimento" : "atendimentos"}
              {pendingCount > 0 ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {" "}
                  · {pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"} de confirmação
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full border border-zinc-300 bg-white p-0.5 shadow-sm dark:border-white/15 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Dia anterior"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-900/5 dark:text-stone-200 dark:hover:bg-white/10"
            >
              <CalendarBlank size={15} />
              Hoje
            </button>
            <button
              type="button"
              onClick={() => shiftDay(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Próximo dia"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>

          {filterOptions.length > 1 ? (
            <select
              value={professionalFilter}
              onChange={(e) => {
                setProfessionalFilter(e.target.value);
                reload(date, e.target.value);
              }}
              aria-label="Filtrar por profissional"
              className="h-10 rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 shadow-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
            >
              <option value="">Todos os profissionais</option>
              {filterOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}

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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent-500 px-5 text-sm font-semibold text-white shadow-sm shadow-accent-500/30 transition-colors hover:bg-accent-600"
            >
              <Plus size={16} weight="bold" />
              Novo atendimento
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex min-w-0 flex-col">
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
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
              {APPOINTMENT_STATUS_ORDER.map((status) => (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600 dark:bg-white/5 dark:text-stone-300"
                >
                  <span className={clsx("h-2 w-2 rounded-full", getStatusDotClasses(status))} />
                  {getStatusLabel(status)}
                </span>
              ))}
            </div>

            {/* A grade rola por dentro (cabeçalho e horas ficam fixos), em vez de esticar a página por 15 horas. */}
            <div
              ref={gridRef}
              className={clsx(
                "relative max-h-[calc(100dvh-17rem)] min-h-[26rem] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900/60",
                isPending && "opacity-60",
              )}
            >
              <div className="flex min-w-full">
                {/* Gutter de horas */}
                <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
                  <div className={clsx(HEADER_HEIGHT, "sticky top-0 z-30 border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900")} />
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className={clsx(
                          "absolute right-2 text-[11px] font-medium text-zinc-400 tabular-nums dark:text-stone-500",
                          i > 0 && "-translate-y-1/2",
                        )}
                        style={{ top: (h * 60 - GRID_TOP_MIN) * PX_PER_MIN + (i === 0 ? 4 : 0) }}
                      >
                        {String(h).padStart(2, "0")}h
                      </div>
                    ))}
                    {nowVisible ? (
                      <div
                        className="absolute right-1 -translate-y-1/2 rounded bg-rose-500 px-1 text-[10px] font-semibold text-white tabular-nums"
                        style={{ top: (nowMinutes! - GRID_TOP_MIN) * PX_PER_MIN }}
                      >
                        {String(Math.floor(nowMinutes! / 60)).padStart(2, "0")}:{String(nowMinutes! % 60).padStart(2, "0")}
                      </div>
                    ) : null}
                  </div>
                </div>

                {columns.map((professional) => {
                  const dayHours = professional.workingHours.filter((w) => w.weekday === weekday);
                  const appts = calendar.appointments.filter((a) => a.professionalId === professional.id);
                  const blocks = calendar.timeBlocks.filter((b) => b.professionalId === professional.id);
                  const count = appts.filter((a) => a.status !== "CANCELED").length;

                  return (
                    <div
                      key={professional.id}
                      className="min-w-56 flex-1 border-r border-zinc-200 last:border-r-0 dark:border-white/10"
                    >
                      <div
                        className={clsx(
                          HEADER_HEIGHT,
                          "sticky top-0 z-10 flex items-center gap-2.5 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur dark:border-white/10 dark:bg-zinc-900/95",
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-500/20 dark:text-accent-200">
                          {initials(professional.name)}
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{professional.name}</span>
                          <span className="block text-xs text-zinc-500 dark:text-stone-400">
                            {dayHours.length === 0 ? "Sem expediente" : `${count} ${count === 1 ? "atendimento" : "atendimentos"}`}
                          </span>
                        </span>
                      </div>

                      {/* Fora do expediente fica acinzentado; o horário de trabalho fica claro. */}
                      <div
                        className="relative bg-zinc-100/80 dark:bg-black/25"
                        style={{ height: GRID_HEIGHT }}
                        onClick={(e) => handleColumnClick(professional.id, e)}
                        title={canManage ? "Clique num horário livre para agendar" : undefined}
                      >
                        {dayHours.map((w, i) => (
                          <div
                            key={i}
                            className="absolute inset-x-0 bg-white dark:bg-zinc-900"
                            style={{
                              top: (w.startMinute - GRID_TOP_MIN) * PX_PER_MIN,
                              height: (w.endMinute - w.startMinute) * PX_PER_MIN,
                            }}
                          />
                        ))}

                        {/* Linhas: cheia na hora, tracejada na meia hora */}
                        {hours.map((h) => (
                          <div key={h}>
                            <div
                              className="absolute inset-x-0 border-t border-zinc-200 dark:border-white/10"
                              style={{ top: (h * 60 - GRID_TOP_MIN) * PX_PER_MIN }}
                            />
                            {h < DAY_END_HOUR ? (
                              <div
                                className="absolute inset-x-0 border-t border-dashed border-zinc-200/70 dark:border-white/5"
                                style={{ top: (h * 60 + 30 - GRID_TOP_MIN) * PX_PER_MIN }}
                              />
                            ) : null}
                          </div>
                        ))}

                        {/* Bloqueios */}
                        {blocks.map((b) => {
                          const top = (minutesFromDayStart(b.startAt, date) - GRID_TOP_MIN) * PX_PER_MIN;
                          const height =
                            (minutesFromDayStart(b.endAt, date) - minutesFromDayStart(b.startAt, date)) * PX_PER_MIN;
                          return (
                            <div
                              key={b.id}
                              className="absolute inset-x-1.5 rounded-lg bg-[repeating-linear-gradient(45deg,rgba(120,120,120,0.18)_0_6px,transparent_6px_12px)] px-2 py-1 text-[11px] font-medium text-zinc-500 dark:text-stone-400"
                              style={{ top, height }}
                            >
                              {b.reason ?? "Bloqueado"}
                            </div>
                          );
                        })}

                        {/* Atendimentos */}
                        {appts.map((a) => {
                          const top = (minutesFromDayStart(a.startAt, date) - GRID_TOP_MIN) * PX_PER_MIN;
                          const durationMin = minutesFromDayStart(a.endAt, date) - minutesFromDayStart(a.startAt, date);
                          const naturalHeight = durationMin * PX_PER_MIN;
                          // Piso de 26px é só legibilidade (cabe a primeira linha) — não tenta
                          // "corrigir" a duração visualmente, por isso atendimentos curtos ganham o
                          // texto de duração explícito abaixo em vez de depender só da altura.
                          const height = Math.max(26, naturalHeight);
                          const isCompact = naturalHeight < 34;
                          const isMedium = !isCompact && naturalHeight < 56;
                          const start = DateTime.fromISO(a.startAt).setZone(TIMEZONE).toFormat("HH:mm");
                          const end = DateTime.fromISO(a.endAt).setZone(TIMEZONE).toFormat("HH:mm");
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(a);
                              }}
                              className={clsx(
                                "absolute inset-x-1.5 z-[2] overflow-hidden rounded-lg border border-l-4 px-2.5 py-1 text-left text-xs leading-tight shadow-sm",
                                "transition-[filter,box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-md hover:brightness-95 dark:hover:brightness-125",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current",
                                getStatusBlockClasses(a.status),
                                getStatusAccentClasses(a.status),
                              )}
                              style={{ top, height }}
                            >
                              {isCompact ? (
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className="tabular-nums opacity-70">{start}</span>
                                  <span className="truncate font-semibold">{a.clientName}</span>
                                </span>
                              ) : isMedium ? (
                                <>
                                  <span className="block font-semibold tabular-nums opacity-70">
                                    {start} – {end}
                                  </span>
                                  <span className="block truncate text-[13px] font-semibold">{a.clientName}</span>
                                </>
                              ) : (
                                <>
                                  <span className="block font-semibold tabular-nums opacity-70">
                                    {start} – {end}
                                  </span>
                                  <span className="block truncate text-[13px] font-semibold">{a.clientName}</span>
                                  <span className="block truncate opacity-80">
                                    {a.items?.map((i) => i.serviceName).join(", ") ?? a.service?.name}
                                  </span>
                                </>
                              )}
                            </button>
                          );
                        })}

                        {/* Linha de "agora" */}
                        {nowVisible ? (
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-rose-500"
                            style={{ top: (nowMinutes! - GRID_TOP_MIN) * PX_PER_MIN }}
                          >
                            <span className="absolute -top-[5px] -left-1 h-2 w-2 rounded-full bg-rose-500" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {visibleAppointments.length === 0 ? (
                <div className="pointer-events-none sticky bottom-6 z-30 -mt-14 flex justify-center px-4">
                  <p className="rounded-full bg-zinc-900/85 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur dark:bg-white/90 dark:text-zinc-900">
                    Nenhum atendimento neste dia{canManage ? ". Clique num horário livre para agendar." : "."}
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
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

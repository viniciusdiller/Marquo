"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import type { AvailableSlot, PublicBooking } from "@marquo/shared-types";
import { publicApi } from "@/lib/api";
import { DateTimeStep } from "../booking/DateTimeStep";
import { WaitlistForm } from "../booking/WaitlistForm";
import { joinWaitlistAction } from "@/app/[slug]/agendar/actions";
import { cancelMyBookingAction, rescheduleMyBookingAction } from "@/app/minha-conta/actions";

const TIMEZONE = "America/Sao_Paulo";

const ACTION_BUTTON =
  "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed disabled:opacity-50";

// "set." → "set": o locale pt-BR devolve abreviações com ponto.
function short(dt: DateTime, format: string) {
  return dt.toFormat(format).replace(".", "");
}

// Um horário marcado, desenhado como ingresso: canhoto escuro com o dia em destaque, serrilha
// e o corpo com salão, serviço e horário. A lista da conta cruza vários salões, então o slug de
// cada atendimento vem do próprio atendimento (booking.tenant), nunca de uma rota.
export function AppointmentTicket({ booking }: { booking: PublicBooking }) {
  const slug = booking.tenant?.slug ?? "";
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(() =>
    DateTime.now().setZone(TIMEZONE).toISODate()!,
  );
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const slotsRequestRef = useRef(0);

  const start = DateTime.fromISO(booking.startAt).setZone(TIMEZONE).setLocale("pt-BR");
  const end = DateTime.fromISO(booking.endAt).setZone(TIMEZONE).setLocale("pt-BR");
  const isPast = DateTime.fromISO(booking.startAt) < DateTime.now();
  const canManage = booking.status === "CONFIRMED" && !isPast;
  const price = (booking.priceCentsSnapshot / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  function loadSlots(date: string) {
    const requestId = ++slotsRequestRef.current;
    setIsLoadingSlots(true);
    setSlotsError(false);
    publicApi
      .getAvailability(slug, booking.professionalId, booking.serviceId, date)
      .then((result) => {
        if (slotsRequestRef.current !== requestId) return;
        setSlots(result);
      })
      .catch(() => {
        if (slotsRequestRef.current !== requestId) return;
        setSlotsError(true);
      })
      .finally(() => {
        if (slotsRequestRef.current !== requestId) return;
        setIsLoadingSlots(false);
      });
  }

  function handleEnterReschedule() {
    setMode("reschedule");
    setSelectedSlot(null);
    setShowWaitlist(false);
    loadSlots(selectedDate);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setShowWaitlist(false);
    loadSlots(date);
  }

  async function handleJoinWaitlist() {
    return joinWaitlistAction(slug, {
      serviceId: booking.serviceId,
      professionalId: booking.professionalId,
      preferredDate: selectedDate,
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMyBookingAction(booking.id);
      if (result?.error) setError(result.error);
    });
  }

  function handleConfirmReschedule() {
    if (!selectedSlot) return;
    setError(null);
    startTransition(async () => {
      const result = await rescheduleMyBookingAction(booking.id, selectedSlot.startAt);
      if (result?.error) {
        setError(result.error);
      } else {
        setMode("view");
      }
    });
  }

  return (
    <article className="relative flex flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm sm:flex-row dark:border-white/10 dark:bg-zinc-900">
      {/* Canhoto */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-dashed border-white/20 bg-[#17161A] px-6 py-4 text-white sm:w-36 sm:flex-col sm:justify-center sm:gap-1 sm:border-b-0 sm:px-4 sm:py-8 dark:bg-black/50">
        <span className="text-[11px] font-bold tracking-[0.22em] text-(--tenant-accent-secondary) uppercase">
          {short(start, "LLL")}
        </span>
        <span className="font-brand text-5xl leading-none tabular-nums sm:text-6xl">
          {start.toFormat("d")}
        </span>
        <span className="text-xs font-medium text-white/60 capitalize">{short(start, "ccc")}</span>
      </div>

      {/* Serrilha (só quando o canhoto fica ao lado) */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-36 z-10 hidden sm:block">
        <span className="absolute top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-50 dark:bg-zinc-950" />
        <span className="absolute bottom-0 h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-stone-50 dark:bg-zinc-950" />
        <span className="absolute inset-y-3 -translate-x-px border-l border-dashed border-zinc-300 dark:border-white/15" />
      </div>

      {/* Corpo */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6 sm:pl-8">
        {mode === "view" ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {booking.tenant ? (
                  <Link
                    href={`/${slug}`}
                    className="text-[11px] font-bold tracking-[0.14em] text-(--tenant-accent) uppercase hover:underline"
                  >
                    {booking.tenant.name}
                  </Link>
                ) : null}
                <h3 className="mt-1 font-brand text-xl leading-tight font-bold text-zinc-900 dark:text-white">
                  {booking.service?.name}
                </h3>
              </div>
              <span
                className={
                  booking.status === "CANCELED"
                    ? "shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:bg-white/5 dark:text-stone-400"
                    : "shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                }
              >
                {booking.status === "CANCELED" ? "Cancelado" : "Confirmado"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-stone-400">Horário</dt>
                <dd className="mt-0.5 font-semibold text-zinc-900 tabular-nums dark:text-white">
                  {start.toFormat("HH:mm")} – {end.toFormat("HH:mm")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-stone-400">Profissional</dt>
                <dd className="mt-0.5 truncate font-semibold text-zinc-900 dark:text-white">
                  {booking.professional?.user.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-stone-400">Valor</dt>
                <dd className="mt-0.5 font-semibold text-zinc-900 tabular-nums dark:text-white">
                  {price}
                </dd>
              </div>
            </dl>

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEnterReschedule}
                  className={`${ACTION_BUTTON} bg-(--tenant-accent)/10 text-(--tenant-accent) hover:bg-(--tenant-accent) hover:text-white`}
                >
                  Remarcar
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={pending}
                  className={`${ACTION_BUTTON} text-zinc-600 hover:bg-red-50 hover:text-red-600 dark:text-stone-300 dark:hover:bg-red-500/10 dark:hover:text-red-400`}
                >
                  {pending ? "Cancelando..." : "Cancelar"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h3 className="font-brand text-xl font-bold text-zinc-900 dark:text-white">
              Escolher novo horário
            </h3>

            <DateTimeStep
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              slots={slots}
              isLoadingSlots={isLoadingSlots}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              onJoinWaitlist={() => setShowWaitlist(true)}
              loadError={slotsError}
              onRetry={() => loadSlots(selectedDate)}
            />

            {showWaitlist ? (
              <WaitlistForm onSubmit={handleJoinWaitlist} onCancel={() => setShowWaitlist(false)} />
            ) : null}

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("view")}
                className={`${ACTION_BUTTON} text-zinc-600 hover:bg-zinc-900/5 dark:text-stone-300 dark:hover:bg-white/10`}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                disabled={!selectedSlot || pending}
                className={`${ACTION_BUTTON} bg-(--tenant-accent) text-white hover:brightness-90`}
              >
                {pending ? "Salvando..." : "Confirmar novo horário"}
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

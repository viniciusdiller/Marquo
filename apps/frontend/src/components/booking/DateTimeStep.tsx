"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { motion } from "motion/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { AvailableSlot } from "@marquo/shared-types";

const TIMEZONE = "America/Sao_Paulo";
const DAYS_AHEAD = 14;

function buildDateOptions() {
  const today = DateTime.now().setZone(TIMEZONE).startOf("day");
  return Array.from({ length: DAYS_AHEAD }, (_, i) => today.plus({ days: i }));
}

// Faixa de dias com rolagem horizontal. Antes: o contêiner cortava o último dia sem nenhuma pista de que dava para
// rolar, e o dia selecionado (ampliado) era recortado nas bordas por causa do overflow. Agora tem respiro nas
// laterais, setas (quando há mais dias para o lado), degradê nas bordas e rola sozinha até o dia escolhido.
function DayStrip({
  days,
  selectedDate,
  onSelectDate,
}: {
  days: DateTime[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges]);

  // Mantém o dia escolhido visível (ex.: ao voltar a esta etapa com uma data lá na frente).
  useEffect(() => {
    scroller.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selectedDate]);

  function scrollByPage(direction: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={updateEdges}
        role="group"
        aria-label="Dias disponíveis"
        className="flex snap-x gap-2 overflow-x-auto scroll-smooth px-1 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((day) => {
          const iso = day.toISODate()!;
          const isSelected = iso === selectedDate;
          return (
            <motion.button
              key={iso}
              type="button"
              aria-pressed={isSelected}
              aria-label={day.setLocale("pt-BR").toFormat("cccc, d 'de' LLLL")}
              onClick={() => onSelectDate(iso)}
              whileTap={{ scale: 0.94 }}
              animate={{ scale: isSelected ? 1.04 : 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className={clsx(
                "flex w-16 shrink-0 snap-start flex-col items-center gap-0.5 rounded-2xl border py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40",
                isSelected
                  ? "border-(--tenant-accent) bg-(--tenant-accent)/10 text-(--tenant-accent)"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900 dark:text-stone-300",
              )}
            >
              <span className="text-[11px] font-medium uppercase">{day.setLocale("pt-BR").toFormat("ccc")}</span>
              <span className="font-display text-lg font-bold">{day.toFormat("dd")}</span>
            </motion.button>
          );
        })}
      </div>

      {edges.left ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-stone-50 to-transparent dark:from-zinc-950"
          />
          <button
            type="button"
            aria-label="Dias anteriores"
            onClick={() => scrollByPage(-1)}
            className="absolute top-1/2 left-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40 dark:border-white/10 dark:bg-zinc-900 dark:text-stone-200"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
        </>
      ) : null}
      {edges.right ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-stone-50 to-transparent dark:from-zinc-950"
          />
          <button
            type="button"
            aria-label="Próximos dias"
            onClick={() => scrollByPage(1)}
            className="absolute top-1/2 right-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40 dark:border-white/10 dark:bg-zinc-900 dark:text-stone-200"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </>
      ) : null}
    </div>
  );
}

export function DateTimeStep({
  selectedDate,
  onSelectDate,
  slots,
  isLoadingSlots,
  selectedSlot,
  onSelectSlot,
  onJoinWaitlist,
  loadError = false,
  onRetry,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  slots: AvailableSlot[];
  isLoadingSlots: boolean;
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
  onJoinWaitlist: () => void;
  // Sem isso, uma falha de rede ao buscar os horários virava "sem horários livres" —
  // idêntico visualmente a um dia de verdade sem vaga, sem chance de tentar de novo.
  loadError?: boolean;
  onRetry?: () => void;
}) {
  const dateOptions = buildDateOptions();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1 flex items-baseline justify-between text-sm font-medium text-zinc-700 dark:text-stone-200">
          <span>Escolha o dia</span>
          <span className="text-xs font-normal text-zinc-500 capitalize dark:text-stone-400">
            {DateTime.fromISO(selectedDate, { zone: TIMEZONE }).setLocale("pt-BR").toFormat("LLLL 'de' yyyy")}
          </span>
        </p>
        <DayStrip days={dateOptions} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-stone-200">
          Horários disponíveis
        </p>

        {isLoadingSlots ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-11 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-dashed border-red-300 p-6 text-center dark:border-red-500/30">
            <p className="text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar os horários.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-md text-sm font-semibold text-(--tenant-accent) hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-white/15">
            <p className="text-sm text-zinc-600 dark:text-stone-300">
              Não há horários livres neste dia.
            </p>
            <button
              type="button"
              onClick={onJoinWaitlist}
              className="mt-3 rounded-md text-sm font-semibold text-(--tenant-accent) hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40"
            >
              Entrar na lista de espera
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot, i) => {
              const isSelected = slot.startAt === selectedSlot?.startAt;
              return (
                <motion.button
                  key={slot.startAt}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  whileTap={{ scale: 0.92 }}
                  animate={{ scale: isSelected ? 1.07 : 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                  style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                  className={clsx(
                    "animate-rise-in",
                    "rounded-xl border py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/40",
                    isSelected
                      ? "border-(--tenant-accent) bg-(--tenant-accent) text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900 dark:text-stone-200",
                  )}
                >
                  {DateTime.fromISO(slot.startAt).setZone(TIMEZONE).toFormat("HH:mm")}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

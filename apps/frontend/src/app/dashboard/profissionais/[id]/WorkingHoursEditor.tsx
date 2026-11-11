"use client";

import { useState, useTransition } from "react";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { updateWorkingHoursAction, type WorkingHoursInterval } from "./actions";
import { TimePicker } from "@/components/ui/time-picker";

const WEEKDAYS: { value: string; label: string }[] = [
  { value: "MONDAY", label: "Segunda" },
  { value: "TUESDAY", label: "Terça" },
  { value: "WEDNESDAY", label: "Quarta" },
  { value: "THURSDAY", label: "Quinta" },
  { value: "FRIDAY", label: "Sexta" },
  { value: "SATURDAY", label: "Sábado" },
  { value: "SUNDAY", label: "Domingo" },
];

type Row = { id: string; start: string; end: string };

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function WorkingHoursEditor({
  professionalId,
  initialIntervals,
}: {
  professionalId: string;
  initialIntervals: WorkingHoursInterval[];
}) {
  const [rowsByDay, setRowsByDay] = useState<Record<string, Row[]>>(() => {
    const initial: Record<string, Row[]> = {};
    for (const day of WEEKDAYS) initial[day.value] = [];
    for (const interval of initialIntervals) {
      initial[interval.weekday] = [
        ...(initial[interval.weekday] ?? []),
        {
          id: `${interval.weekday}-${interval.startMinute}`,
          start: minutesToTime(interval.startMinute),
          end: minutesToTime(interval.endMinute),
        },
      ];
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function addRow(day: string) {
    setSaved(false);
    setRowsByDay((prev) => ({
      ...prev,
      [day]: [...prev[day], { id: `${day}-${Date.now()}`, start: "09:00", end: "18:00" }],
    }));
  }

  function removeRow(day: string, id: string) {
    setSaved(false);
    setRowsByDay((prev) => ({ ...prev, [day]: prev[day].filter((row) => row.id !== id) }));
  }

  function updateRow(day: string, id: string, field: "start" | "end", value: string) {
    setSaved(false);
    setRowsByDay((prev) => ({
      ...prev,
      [day]: prev[day].map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  }

  function handleSave() {
    setError(null);
    const intervals: WorkingHoursInterval[] = [];
    for (const day of WEEKDAYS) {
      for (const row of rowsByDay[day.value]) {
        const startMinute = timeToMinutes(row.start);
        const endMinute = timeToMinutes(row.end);
        if (startMinute >= endMinute) {
          setError(`Horário inválido em ${day.label.toLowerCase()}: início deve ser antes do fim.`);
          return;
        }
        intervals.push({ weekday: day.value, startMinute, endMinute });
      }
    }

    startTransition(async () => {
      const result = await updateWorkingHoursAction(professionalId, intervals);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <div className="flex flex-col gap-5">
        {WEEKDAYS.map((day) => (
          <div key={day.value} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <p className="w-24 shrink-0 pt-2 text-sm font-medium text-zinc-700 dark:text-stone-200">
              {day.label}
            </p>
            <div className="flex flex-1 flex-col gap-2">
              {rowsByDay[day.value].length === 0 ? (
                <p className="pt-2 text-sm text-zinc-400 dark:text-stone-500">Não atende</p>
              ) : (
                rowsByDay[day.value].map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <TimePicker
                      aria-label={`Início do intervalo de ${day.label}`}
                      value={row.start}
                      onChange={(value) => updateRow(day.value, row.id, "start", value)}
                      compact
                      className="w-[4.5rem] px-2 py-1.5 text-sm"
                    />
                    <span className="text-sm text-zinc-400">até</span>
                    <TimePicker
                      aria-label={`Fim do intervalo de ${day.label}`}
                      value={row.end}
                      onChange={(value) => updateRow(day.value, row.id, "end", value)}
                      compact
                      className="w-[4.5rem] px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(day.value, row.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-600"
                      aria-label="Remover intervalo"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={() => addRow(day.value)}
                className="flex w-fit items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-300"
              >
                <Plus size={14} />
                Adicionar horário
              </button>
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {saved ? <p className="mt-4 text-sm text-accent-600 dark:text-accent-300">Horários salvos.</p> : null}

      <span data-tour="working-hours-save" className="mt-5 inline-block">
        <Button onClick={handleSave} disabled={isPending} className="disabled:opacity-60">
          {isPending ? "Salvando..." : "Salvar horários"}
        </Button>
      </span>
    </div>
  );
}

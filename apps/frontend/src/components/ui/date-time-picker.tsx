"use client";

import { type ReactNode, useId, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { joinDateTime, parseTime, splitDateTime } from "@/lib/date-input";

export interface DateTimePickerProps {
  /** "yyyy-MM-ddTHH:mm" (o mesmo formato do <input type="datetime-local">). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: ReactNode;
  /** "yyyy-MM-ddTHH:mm": antes disso fica desabilitado (dia e, no mesmo dia, horário). */
  min?: string;
  minuteStep?: number;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

// Data + hora lado a lado, trocando o <input type="datetime-local">. O valor só existe quando as DUAS partes estão preenchidas.
export function DateTimePicker({ value, defaultValue = "", onChange, name, label, min, minuteStep = 5, required, disabled, id }: DateTimePickerProps) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const [inner, setInner] = useState(splitDateTime(defaultValue));
  const controlled = value !== undefined;
  const parts = controlled ? splitDateTime(value) : inner;
  // Controlado com valor incompleto: guarda a parte já escolhida até a outra chegar.
  const [partial, setPartial] = useState({ date: "", time: "" });
  const date = parts.date || partial.date;
  const time = parts.time || partial.time;

  const minParts = splitDateTime(min);
  const minTime = parseTime(minParts.time);

  function update(nextDate: string, nextTime: string) {
    setPartial({ date: nextDate, time: nextTime });
    if (!controlled) setInner({ date: nextDate, time: nextTime });
    onChange?.(joinDateTime(nextDate, nextTime));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label ? <span id={`${baseId}-label`} className="text-sm font-medium text-zinc-700 dark:text-stone-200">{label}</span> : null}
      <div role="group" aria-labelledby={label ? `${baseId}-label` : undefined} className="grid grid-cols-[1fr_auto] gap-2">
        <DatePicker
          aria-label={typeof label === "string" ? `${label} (data)` : "Data"}
          value={date}
          min={minParts.date || undefined}
          onChange={(d) => update(d, time)}
          required={required}
          disabled={disabled}
        />
        <TimePicker
          aria-label={typeof label === "string" ? `${label} (hora)` : "Hora"}
          value={time}
          minuteStep={minuteStep}
          disabled={disabled}
          className="min-w-28"
          isTimeDisabled={
            minTime && date && date === minParts.date
              ? (h, m) => h < minTime.hour || (h === minTime.hour && m < minTime.minute)
              : undefined
          }
          onChange={(t) => update(date, t)}
        />
      </div>
      {name ? (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden
          name={name}
          value={joinDateTime(date, time)}
          required={required}
          onChange={() => {}}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      ) : null}
    </div>
  );
}

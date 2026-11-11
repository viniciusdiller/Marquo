"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Clock } from "@phosphor-icons/react/dist/ssr";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatTime, minuteOptions, parseTime } from "@/lib/date-input";

export interface TimePickerProps {
  /** Valor controlado, "HH:mm" ("" = vazio). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: ReactNode;
  hint?: string;
  error?: string;
  placeholder?: string;
  /** Passo da lista de minutos (padrão 5). Um minuto já salvo fora do passo continua aparecendo. */
  minuteStep?: number;
  /** Horários que não podem ser escolhidos (ex.: antes de agora). */
  isTimeDisabled?: (hour: number, minute: number) => boolean;
  required?: boolean;
  disabled?: boolean;
  /** Versão enxuta para linhas apertadas (ex.: horário de trabalho): sem ícone e com o horário centralizado. */
  compact?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function Column({
  label,
  items,
  selected,
  isDisabled,
  onPick,
  pad = true,
}: {
  label: string;
  items: number[];
  selected: number | undefined;
  isDisabled: (n: number) => boolean;
  onPick: (n: number) => void;
  pad?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Ao abrir, leva a rolagem até o item escolhido.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div ref={ref} role="listbox" aria-label={label} className="flex h-56 w-16 flex-col gap-0.5 overflow-y-auto p-1.5">
      {items.map((n) => {
        const active = n === selected;
        return (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={active}
            disabled={isDisabled(n)}
            onClick={() => onPick(n)}
            className={cn(
              "rounded-lg px-2 py-1.5 text-center text-sm tabular-nums transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500 disabled:pointer-events-none disabled:opacity-35",
              active
                ? "bg-accent-500 font-medium text-white"
                : "text-zinc-700 hover:bg-zinc-900/5 dark:text-stone-200 dark:hover:bg-white/10",
            )}
          >
            {pad ? String(n).padStart(2, "0") : n}
          </button>
        );
      })}
    </div>
  );
}

// Seletor de horário (colunas de hora e minuto num Popover, no padrão visual do shadcn/ui) no lugar do <input type="time">.
export function TimePicker({
  value,
  defaultValue = "",
  onChange,
  name,
  label,
  hint,
  error,
  placeholder = "--:--",
  minuteStep = 5,
  isTimeDisabled,
  required,
  disabled,
  compact,
  id,
  className,
  "aria-label": ariaLabel,
}: TimePickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const parsed = parseTime(current);

  function commit(hour: number, minute: number) {
    const next = formatTime(hour, minute);
    if (value === undefined) setInner(next);
    onChange?.(next);
  }

  function handleOpenChange(next: boolean) {
    if (next) setContainer(triggerRef.current?.closest("dialog") ?? null);
    setOpen(next);
  }

  const blocked = (h: number, m: number) => isTimeDisabled?.(h, m) ?? false;
  const minutes = minuteOptions(minuteStep, parsed?.minute);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label id={`${fieldId}-label`} htmlFor={fieldId} className="text-sm font-medium text-zinc-700 dark:text-stone-200">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              id={fieldId}
              type="button"
              disabled={disabled}
              // O nome acessível junta o rótulo E o valor escolhido (um <label> sozinho esconderia a data/hora do leitor de tela).
              aria-labelledby={label ? `${fieldId}-label ${fieldId}-value` : undefined}
              aria-label={label ? undefined : ariaLabel ? `${ariaLabel}, ${parsed ? formatTime(parsed.hour, parsed.minute) : placeholder}` : undefined}
              aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
              className={cn(
                compact ? "justify-center" : "justify-between",
                "flex w-full items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-left text-[15px] tabular-nums text-zinc-900",
                "focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none disabled:opacity-50",
                "dark:border-white/15 dark:bg-zinc-900 dark:text-white",
                error && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
                !parsed && "text-zinc-400 dark:text-stone-500",
                className,
              )}
            >
              <span id={`${fieldId}-value`}>{parsed ? formatTime(parsed.hour, parsed.minute) : placeholder}</span>
              {compact ? null : <Clock size={18} className="shrink-0 text-zinc-400 dark:text-stone-500" />}
            </button>
          </PopoverTrigger>
          <PopoverContent container={container}>
            <div className="flex divide-x divide-zinc-100 dark:divide-white/10">
              <Column
                label="Hora"
                items={HOURS}
                selected={parsed?.hour}
                // A hora só fica bloqueada se NENHUM minuto dela puder ser escolhido.
                isDisabled={(h) => minutes.every((m) => blocked(h, m))}
                onPick={(h) => {
                  // Mantém o minuto; se ele ficou bloqueado nessa hora, vai para o primeiro livre.
                  const keep = parsed?.minute ?? 0;
                  const minute = blocked(h, keep) ? (minutes.find((m) => !blocked(h, m)) ?? keep) : keep;
                  commit(h, minute);
                }}
              />
              <Column
                label="Minuto"
                items={minutes}
                selected={parsed?.minute}
                isDisabled={(m) => blocked(parsed?.hour ?? 0, m)}
                onPick={(m) => {
                  commit(parsed?.hour ?? 0, m);
                  setOpen(false);
                }}
              />
            </div>
          </PopoverContent>
        </Popover>
        {name ? (
          <input
            type="text"
            tabIndex={-1}
            aria-hidden
            name={name}
            value={current}
            required={required}
            onChange={() => {}}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
          />
        ) : null}
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-sm text-zinc-500 dark:text-stone-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

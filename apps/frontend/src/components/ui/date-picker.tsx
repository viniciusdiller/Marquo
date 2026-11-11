"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatBRDate, parseISODate, toISODate } from "@/lib/date-input";

export interface DatePickerProps {
  /** Valor controlado, "yyyy-MM-dd" ("" = vazio). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Vai no envio do formulário (campo escondido), no mesmo formato do <input type="date">. */
  name?: string;
  label?: ReactNode;
  hint?: string;
  error?: string;
  placeholder?: string;
  /** "yyyy-MM-dd": datas antes/depois ficam desabilitadas. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  /** Mostra "Limpar" (campo opcional). */
  clearable?: boolean;
  /** Lista de anos/meses para escolher (ex.: data de nascimento). */
  dropdownYears?: { from: number; to: number };
  id?: string;
  className?: string;
  "aria-label"?: string;
}

// Seletor de data (shadcn/ui: Popover + Calendar) no lugar do <input type="date"> do navegador, para o site todo ter o mesmo visual.
export function DatePicker({
  value,
  defaultValue = "",
  onChange,
  name,
  label,
  hint,
  error,
  placeholder = "Escolha a data",
  min,
  max,
  required,
  disabled,
  clearable,
  dropdownYears,
  id,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = parseISODate(current);
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);

  function commit(next: string) {
    if (value === undefined) setInner(next);
    onChange?.(next);
  }

  function handleOpenChange(next: boolean) {
    // Dentro de um <dialog> aberto com showModal() o calendário precisa nascer dentro dele (senão fica atrás).
    if (next) setContainer(triggerRef.current?.closest("dialog") ?? null);
    setOpen(next);
  }

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
              aria-label={label ? undefined : ariaLabel ? `${ariaLabel}, ${selected ? formatBRDate(current) : placeholder}` : undefined}
              aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-left text-[15px] text-zinc-900",
                "focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none disabled:opacity-50",
                "dark:border-white/15 dark:bg-zinc-900 dark:text-white",
                error && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
                !selected && "text-zinc-400 dark:text-stone-500",
                className,
              )}
            >
              <span id={`${fieldId}-value`} className="truncate">{selected ? formatBRDate(current) : placeholder}</span>
              <CalendarBlank size={18} className="shrink-0 text-zinc-400 dark:text-stone-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent container={container}>
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? minDate ?? undefined}
              onSelect={(date) => {
                if (!date) return;
                commit(toISODate(date));
                setOpen(false);
              }}
              disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
              {...(dropdownYears
                ? {
                    captionLayout: "dropdown" as const,
                    startMonth: new Date(dropdownYears.from, 0),
                    endMonth: new Date(dropdownYears.to, 11),
                  }
                : {})}
              autoFocus
            />
            <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 text-sm dark:border-white/10">
              {clearable ? (
                <button
                  type="button"
                  onClick={() => {
                    commit("");
                    setOpen(false);
                  }}
                  className="font-medium text-accent-600 hover:underline dark:text-accent-300"
                >
                  Limpar
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  if ((minDate && today < minDate) || (maxDate && today > maxDate)) return;
                  commit(toISODate(today));
                  setOpen(false);
                }}
                className="font-medium text-accent-600 hover:underline dark:text-accent-300"
              >
                Hoje
              </button>
            </div>
          </PopoverContent>
        </Popover>
        {name ? (
          // Campo de texto invisível (e não type=hidden) para o `required` do formulário continuar valendo.
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

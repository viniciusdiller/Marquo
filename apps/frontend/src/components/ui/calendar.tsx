"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

// Calendário do shadcn/ui (react-day-picker) com a cor de destaque e o tema escuro do Marquo, em português.
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex h-8 items-center justify-center px-9",
        caption_label: "text-sm font-medium capitalize",
        dropdowns: "flex items-center justify-center gap-1.5 text-sm font-medium",
        dropdown_root: "relative",
        dropdown:
          "absolute inset-0 cursor-pointer opacity-0",
        nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
        button_previous:
          "inline-flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-900/5 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-white/10",
        button_next:
          "inline-flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-900/5 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-white/10",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-[0.8rem] font-normal text-zinc-500 dark:text-stone-400",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button: cn(
          "inline-flex size-9 items-center justify-center rounded-lg font-normal transition-colors",
          "hover:bg-zinc-900/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500 dark:hover:bg-white/10",
          "in-data-[selected=true]:bg-accent-500 in-data-[selected=true]:text-white in-data-[selected=true]:hover:bg-accent-600",
          "in-data-[disabled=true]:pointer-events-none in-data-[disabled=true]:opacity-35",
        ),
        today: "font-semibold text-accent-600 dark:text-accent-300",
        outside: "text-zinc-400 opacity-60 dark:text-stone-500",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === "left" ? (
            <CaretLeft size={16} className={chevronClass} />
          ) : orientation === "right" ? (
            <CaretRight size={16} className={chevronClass} />
          ) : (
            <CaretRight size={12} className={cn("rotate-90", chevronClass)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };

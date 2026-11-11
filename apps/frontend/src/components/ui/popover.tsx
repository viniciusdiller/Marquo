"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

// Popover do shadcn/ui (Radix). `container` deixa a janela flutuante nascer DENTRO de um <dialog> aberto com showModal():
// ele fica na "top layer" do navegador e tudo que é anexado ao <body> aparece ATRÁS dele.
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  container,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { container?: HTMLElement | null }) {
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        // Esc fecha só o popover: sem isto o diálogo por baixo (que também escuta Esc no document) fechava junto.
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          onEscapeKeyDown?.(event);
        }}
        className={cn(
          "z-[70] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg outline-hidden",
          "data-[state=open]:animate-in data-[state=closed]:animate-out dark:border-white/10 dark:bg-zinc-900 dark:text-white",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };

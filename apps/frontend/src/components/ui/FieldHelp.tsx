"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Question } from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";

interface FieldHelpProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function FieldHelp({ title, children, className }: FieldHelpProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={clsx("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={title ? `Ajuda sobre ${title}` : "Mais informações"}
        aria-expanded={open}
        className="inline-flex size-4.5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-stone-500 dark:hover:bg-zinc-800 dark:hover:text-stone-200"
      >
        <Question size={13} weight="bold" />
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-xl dark:border-white/10 dark:bg-zinc-900 dark:text-stone-200 sm:w-72"
        >
          {title && <p className="mb-1 font-semibold text-zinc-900 dark:text-white">{title}</p>}
          <div className="space-y-1.5">{children}</div>
          <div className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" />
        </div>
      )}
    </div>
  );
}


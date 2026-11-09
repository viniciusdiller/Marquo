"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, MagnifyingGlass, Moon, Sun, X } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "../ThemeProvider";

const ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-900/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-500 dark:text-stone-100 dark:hover:bg-white/10";

// Menu "hambúrguer" do celular (some a partir de `sm`, onde a barra tem espaço): reúne o link de descoberta e a troca de
// tema claro/escuro, que antes ficava num botão flutuante cobrindo o conteúdo. Padrão "disclosure" (botão com aria-expanded),
// fecha ao clicar fora, com Escape (devolvendo o foco ao botão) e ao navegar.
export function SiteMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 ring-1 ring-zinc-300 ring-inset transition-colors hover:bg-zinc-900/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-stone-200 dark:ring-white/20 dark:hover:bg-white/10"
      >
        {open ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
      </button>

      {open ? (
        <div
          id="site-menu"
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40"
        >
          <Link href="/descobrir" onClick={() => setOpen(false)} className={ITEM_CLASS}>
            <MagnifyingGlass size={20} className="shrink-0 text-accent-600 dark:text-accent-300" />
            Estabelecimentos
          </Link>
          <div className="my-1 h-px bg-zinc-200 dark:bg-white/10" />
          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }}
            className={ITEM_CLASS}
          >
            {isDark ? (
              <Sun size={20} className="shrink-0 text-accent-600 dark:text-accent-300" />
            ) : (
              <Moon size={20} className="shrink-0 text-accent-600 dark:text-accent-300" />
            )}
            {isDark ? "Tema claro" : "Tema escuro"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

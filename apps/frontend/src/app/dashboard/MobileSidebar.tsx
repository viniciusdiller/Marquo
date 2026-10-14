"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowSquareOut, List, X } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/brand/Logo";
import { SidebarNav } from "./SidebarNav";

interface MobileSidebarProps {
  tenant: { name: string; slug: string } | null;
}

// Abaixo de md o <aside> do layout some (hidden md:block) e, sem isto, o dono ficava sem
// NENHUM jeito de navegar fora da Agenda — tinha que digitar a URL de cada tela na mão.
export function MobileSidebar({ tenant }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // O header do dashboard usa backdrop-blur, que cria um novo containing block para
  // descendentes "fixed" — um <div className="fixed inset-0"> preso dentro dele fica
  // confinado à altura do header em vez de cobrir a viewport. Portal pro <body> evita
  // esse acoplamento (e sai na frente de qualquer z-index de ancestral).
  const overlay = (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            className="relative flex h-full w-[86vw] max-w-xs flex-col overflow-y-auto bg-stone-50 p-5 shadow-2xl dark:bg-zinc-950"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900/5 dark:text-stone-400 dark:hover:bg-white/5"
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>

            {tenant ? (
              <>
                <p className="mt-3 truncate text-sm text-zinc-500 dark:text-stone-400">{tenant.name}</p>
                <Link
                  href={`/${tenant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-300 dark:hover:text-accent-200"
                >
                  <ArrowSquareOut size={16} />
                  Ver página pública
                </Link>
              </>
            ) : null}

            <div className="mt-6">
              <SidebarNav scope="mobile" onNavigate={() => setOpen(false)} />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 flex items-center justify-center rounded-lg p-2 text-zinc-600 hover:bg-zinc-900/5 md:hidden dark:text-stone-300 dark:hover:bg-white/5"
        aria-label="Abrir menu"
        aria-expanded={open}
      >
        <List size={22} />
      </button>

      {typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { List, X } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { Logo } from "../brand/Logo";
import type { NavSession } from "@/lib/nav-session";
import { AccountNav } from "../account/AccountNav";

const links = [
  { href: "/descobrir", label: "Descobrir" },
  { href: "/#perto-de-voce", label: "Perto de você" },
];

// "Para donos" (página que explica a plataforma para quem tem um negócio) fica sempre visível,
// ao lado de "Minha loja". Dono/staff logado: "Entrar" some e "Minha loja" é o botão principal.
// Cliente logado: "Entrar" vira o chip do perfil. Deslogado: "Entrar" + "Para donos".
export function Nav({ session }: { session: NavSession }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 8);
  });

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="relative">
        <motion.div
          aria-hidden
          initial={false}
          animate={{ opacity: scrolled ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 border-b border-zinc-900/8 bg-stone-50/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/80"
        />
        <Container className="relative">
          <nav className="flex h-16 items-center justify-between">
            <Link href="/" aria-label="Marquo, página inicial">
              <Logo />
            </Link>

            <ul className="hidden items-center gap-8 lg:flex">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-stone-300 dark:hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden items-center gap-3 lg:flex">
              {session?.kind === "consumer" || session?.kind === "platform" ? (
                <AccountNav session={session} />
              ) : session?.kind === "staff" ? null : (
                <Button href="/entrar" variant="ghost" className="px-5 py-2.5 text-sm">
                  Entrar
                </Button>
              )}
              {session?.kind === "staff" ? (
                <>
                  <Button href="/para-donos" variant="ghost" className="px-5 py-2.5 text-sm">
                    Para donos
                  </Button>
                  <Button href="/dashboard" className="px-5 py-2.5 text-sm">
                    {session.role === "OWNER" ? "Minha loja" : "Painel"}
                  </Button>
                </>
              ) : (
                <Button href="/para-donos" className="px-5 py-2.5 text-sm">
                  Para donos
                </Button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="p-2 text-zinc-700 lg:hidden dark:text-white"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
            >
              {open ? <X size={22} /> : <List size={22} />}
            </button>
          </nav>
        </Container>
      </div>

      <AnimatePresence>
        {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden border-b border-zinc-900/8 bg-stone-50/95 backdrop-blur-md lg:hidden dark:border-white/10 dark:bg-zinc-950/95"
        >
          <Container className="py-4">
           <div
            className="flex flex-col gap-1"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
           >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-900/5 dark:text-stone-200 dark:hover:bg-white/5"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 px-3">
              {session?.kind === "consumer" ? (
                <>
                  <Button href="/minha-conta" variant="ghost" className="w-full">
                    Minha conta ({session.name.split(" ")[0]})
                    {session.upcomingCount > 0 ? ` · ${session.upcomingCount} compromisso${session.upcomingCount > 1 ? "s" : ""}` : ""}
                  </Button>
                </>
              ) : session?.kind === "platform" ? (
                <Button href="/plataforma" variant="ghost" className="w-full">
                  Painel da plataforma
                </Button>
              ) : session?.kind === "staff" ? null : (
                <Button href="/entrar" variant="ghost" className="w-full">
                  Entrar
                </Button>
              )}
              {session?.kind === "staff" ? (
                <>
                  <Button href="/para-donos" variant="ghost" className="w-full">
                    Para donos
                  </Button>
                  <Button href="/dashboard" className="w-full">
                    {session.role === "OWNER" ? "Minha loja" : "Painel"}
                  </Button>
                </>
              ) : (
                <Button href="/para-donos" className="w-full">
                  Para donos
                </Button>
              )}
            </div>
           </div>
          </Container>
        </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

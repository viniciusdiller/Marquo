"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { Logo } from "../brand/Logo";
import { AccountNav } from "../account/AccountNav";
import type { NavSession } from "@/lib/nav-session";
import { SectionLinks, useActiveSection, type SectionNavItem } from "./TenantSectionNav";

// Mesmo padrão do Nav.tsx da home (fixed + transparente no topo, ganha fundo com blur
// só depois de rolar) — reaproveitado aqui pra a marca ter o mesmo peso visual que tem
// no site principal, em vez de um selo pequeno num canto. Sem os links de marketing
// (Como funciona/Recursos/FAQ não existem nessa rota); só a marca e a volta pro
// /descobrir, que sai do corpo da hero pra não duplicar.
export function TenantTopBar({
  slug,
  session,
  sections = [],
}: {
  slug: string;
  session: NavSession;
  sections?: SectionNavItem[];
}) {
  const active = useActiveSection(sections);
  const [scrolled, setScrolled] = useState(false);
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
        <Container className="relative flex h-16 items-center justify-between gap-4">
          <Link href="/" className="shrink-0">
            <Logo markSize={28} />
          </Link>

          {/* Desktop: atalhos das seções no meio da barra (como as abas da Trinks). */}
          <SectionLinks items={sections} active={active} className="hidden min-w-0 lg:block" />

          <div className="flex items-center gap-5">
            <Link
              href="/descobrir"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-stone-300 dark:hover:text-white"
            >
              <ArrowLeft size={16} />
              <span className="sm:hidden">Voltar</span>
              <span className="hidden sm:inline">Descobrir</span>
            </Link>
            <AccountNav session={session} loginNext={`/${slug}`} />
          </div>
        </Container>

        {/* Celular/tablet: os mesmos atalhos numa segunda linha rolável, colada à barra. */}
        {sections.length >= 2 ? (
          <Container className="relative pb-2 lg:hidden">
            <SectionLinks items={sections} active={active} />
          </Container>
        ) : null}
      </div>
    </header>
  );
}

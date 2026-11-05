"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Circle,
  CaretDown,
  ArrowRight,
  Sparkle,
  CalendarCheck,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import type { TenantSetupStatus } from "@marquo/shared-types";
import { useTour } from "@/components/tour/TourProvider";
import { isTourId } from "@/components/tour/tours";

interface SetupGuideProps {
  setup: TenantSetupStatus;
}

const emptySubscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

export function SetupGuide({ setup }: SetupGuideProps) {
  const tour = useTour();
  const isStoredCollapsed = useSyncExternalStore(
    emptySubscribe,
    () => localStorage.getItem("marquo:setup-guide-collapsed") === "true",
    () => false,
  );

  const [userToggled, setUserToggled] = useState<boolean | null>(null);

  const isCollapsed =
    userToggled !== null ? userToggled : (isStoredCollapsed || setup.isFullySetup);

  function toggleCollapse() {
    const next = !isCollapsed;
    setUserToggled(next);
    localStorage.setItem("marquo:setup-guide-collapsed", String(next));
  }

  const percent = Math.round((setup.completedStepsCount / setup.totalStepsCount) * 100);

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-accent-200/80 bg-linear-to-b from-accent-50/70 via-white to-white p-5 shadow-sm dark:border-accent-500/20 dark:from-accent-950/20 dark:via-zinc-900/60 dark:to-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-500 text-white shadow-sm shadow-accent-500/20">
            <Sparkle size={20} weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Guia de Configuração da Barbearia
            </h2>
            <p className="text-xs text-zinc-500 dark:text-stone-400">
              Siga a ordem abaixo para deixar seu negócio pronto para receber agendamentos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-accent-500 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-zinc-700 dark:text-stone-300">
              {setup.completedStepsCount}/{setup.totalStepsCount} ({percent}%)
            </span>
          </div>

          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "Expandir guia de configuração" : "Recolher guia de configuração"}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 dark:text-stone-300 dark:hover:bg-zinc-700"
          >
            <span>{isCollapsed ? "Ver etapas" : "Recolher"}</span>
            <CaretDown
              size={14}
              className={clsx("transition-transform duration-200", !isCollapsed && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {/* Alerta de pronto para agendar */}
      {setup.isReadyForBooking && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CalendarCheck size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold">
              Os requisitos essenciais estão prontos! Sua agenda pública já pode receber clientes.
            </span>
          </div>
          <Link
            href={`/${setup.slug}/agendar`}
            target="_blank"
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            Testar como seu cliente vê
            <ArrowRight size={13} weight="bold" />
          </Link>
        </div>
      )}

      {/* Lista de etapas */}
      {!isCollapsed && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {setup.steps.map((step, index) => {
            const isCritical = step.importance === "critical";

            return (
              <div
                key={step.id}
                className={clsx(
                  "relative flex flex-col justify-between rounded-xl border p-4 transition-colors",
                  step.isComplete
                    ? "border-zinc-200 bg-white/80 dark:border-white/10 dark:bg-zinc-900/60"
                    : isCritical
                      ? "border-accent-200 bg-accent-50/30 dark:border-accent-500/20 dark:bg-accent-500/5"
                      : "border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900/40",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-stone-400">
                      <span>Passo {index + 1}</span>
                      {isCritical && !step.isComplete && (
                        <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold text-accent-700 dark:bg-accent-500/20 dark:text-accent-300">
                          Obrigatório
                        </span>
                      )}
                    </span>

                    {step.isComplete ? (
                      <CheckCircle size={18} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle size={18} className="text-zinc-300 dark:text-zinc-600" />
                    )}
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-stone-400">
                    {step.description}
                  </p>

                  {/* Destaque para o vínculo de serviços */}
                  {step.id === "service_links" && !step.isComplete && (
                    <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-snug text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                      <WarningCircle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        <strong>Regra de Ouro:</strong> Para que o cliente veja horários disponíveis,
                        o barbeiro precisa ter este serviço habilitado em sua ficha!
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-2">
                  <Link
                    href={step.href}
                    // Passo pendente: além de ir para a tela, liga o tour guiado (balões apontando onde clicar).
                    onClick={() => {
                      if (!step.isComplete && isTourId(step.id)) tour.start(step.id);
                    }}
                    className={clsx(
                      "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                      step.isComplete
                        ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 dark:text-stone-200 dark:hover:bg-zinc-700"
                        : "bg-accent-500 text-white shadow-xs hover:bg-accent-600",
                    )}
                  >
                    <span>{step.isComplete ? "Revisar" : "Configurar agora"}</span>
                    <ArrowRight size={13} weight="bold" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


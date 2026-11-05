"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowRight, CursorClick, Lightbulb, X } from "@phosphor-icons/react/dist/ssr";
import type { TenantSetupStepId } from "@marquo/shared-types";
import { computePopoverPosition, holeFromRect, sameBox, type Box, type Size } from "./geometry";
import type { TourState } from "./tour-state";
import { TOURS } from "./tours";

interface TourOverlayProps {
  active: TourState | null;
  onGoTo: (index: number) => void;
  onStop: () => void;
  onStart: (tourId: TenantSetupStepId) => void;
}

interface View {
  key: string;
  el: Element | null;
  box: Box | null;
  vw: number;
  vh: number;
  // Já esperou o suficiente e o elemento não apareceu.
  missing: boolean;
}

const FIND_TIMEOUT_MS = 4000;
const MOBILE_BREAKPOINT = 640;
const POPOVER_WIDTH = 360;
const DIM = "bg-zinc-950/65";

function sameView(a: View | null, b: View): boolean {
  return !!a && a.key === b.key && a.el === b.el && a.vw === b.vw && a.vh === b.vh && a.missing === b.missing && sameBox(a.box, b.box);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

// Tour guiado: escurece a tela, ilumina o elemento certo (marcado com data-tour) e mostra um balão com o passo a passo.
// O elemento iluminado continua clicável e editável; o resto da tela fica travado até a pessoa avançar ou sair.
export function TourOverlay({ active, onGoTo, onStop, onStart }: TourOverlayProps) {
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();
  const bodyId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [popoverSize, setPopoverSize] = useState<Size>({ width: POPOVER_WIDTH, height: 260 });

  const tour = active ? TOURS[active.tourId] : null;
  const stop = tour && active ? tour.stops[active.index] : null;
  const onPath = !!stop && stop.path.test(pathname);
  const key = active && stop ? `${active.tourId}:${active.index}:${pathname}` : "";
  const target = stop?.target ?? null;
  const advanceOnClick = stop?.advanceOn === "click";

  // Procura o elemento a cada quadro (ele pode demorar a renderizar, ser trocado ou mudar de lugar na rolagem) e guarda a
  // posição. Só atualiza o estado quando algo muda de verdade.
  useEffect(() => {
    if (!onPath || !target) return;
    const selector = `[data-tour="${target}"]`;
    const startedAt = performance.now();
    let raf = 0;
    let scrolledTo: Element | null = null;

    const tick = () => {
      const el = document.querySelector(selector);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (el) {
        if (scrolledTo !== el) {
          scrolledTo = el;
          const smooth = !prefersReducedMotion();
          if (vw < MOBILE_BREAKPOINT) {
            // No celular o balão é uma folha no rodapé: deixa o elemento perto do topo, livre dela.
            window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 88), behavior: smooth ? "smooth" : "auto" });
          } else {
            el.scrollIntoView?.({ block: "center", behavior: smooth ? "smooth" : "auto" });
          }
        }
        const r = el.getBoundingClientRect();
        const next: View = { key, el, box: { top: r.top, left: r.left, width: r.width, height: r.height }, vw, vh, missing: false };
        setView((prev) => (sameView(prev, next) ? prev : next));
      } else {
        const next: View = { key, el: null, box: null, vw, vh, missing: performance.now() - startedAt > FIND_TIMEOUT_MS };
        setView((prev) => (sameView(prev, next) ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onPath, target, key]);

  // Clicar no próprio destaque avança o tour (o clique segue normalmente, ex.: abrir a ficha do profissional).
  const current = view && view.key === key ? view : null;
  const targetEl = current?.el ?? null;
  const index = active?.index ?? 0;
  useEffect(() => {
    if (!targetEl || !advanceOnClick) return;
    const handler = () => onGoTo(index + 1);
    targetEl.addEventListener("click", handler, { capture: true });
    return () => targetEl.removeEventListener("click", handler, { capture: true });
  }, [targetEl, advanceOnClick, index, onGoTo]);

  // Esc sai do tour. (As setas ficam livres: a pessoa pode estar digitando num campo destacado.)
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onStop]);

  // Mede o balão para posicioná-lo sem sair da tela.
  useEffect(() => {
    const el = popoverRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setPopoverSize((prev) => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  if (!active || !tour || !stop || typeof document === "undefined") return null;

  const total = tour.stops.length;
  const hrefFor = (i: number) => tour.stops[i]?.resume?.href ?? tour.href;

  function goBack() {
    const previous = tour!.stops[index - 1];
    if (!previous) return;
    onGoTo(index - 1);
    if (!previous.path.test(pathname)) router.push(hrefFor(index - 1));
  }

  // Saiu da tela do passo (clicou no menu, por exemplo): o tour espera e oferece voltar de onde parou.
  if (!onPath) {
    const resume = stop.resume ?? { href: tour.href, index };
    return createPortal(
      <div
        role="status"
        className="fixed bottom-4 left-4 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full bg-zinc-900 p-1.5 pl-4 text-sm text-white shadow-2xl ring-1 ring-white/10 print:hidden"
      >
        <span className="truncate pr-2">
          Tour em andamento: <strong className="font-semibold">{tour.title}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            onGoTo(resume.index);
            router.push(resume.href);
          }}
          className="shrink-0 rounded-full bg-accent-500 px-3.5 py-1.5 font-semibold hover:bg-accent-600"
        >
          Continuar
        </button>
        <button type="button" onClick={onStop} aria-label="Sair do tour" className="shrink-0 rounded-full p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white">
          <X size={16} />
        </button>
      </div>,
      document.body,
    );
  }

  const vw = current?.vw ?? window.innerWidth;
  const vh = current?.vh ?? window.innerHeight;
  const isMobile = vw < MOBILE_BREAKPOINT;
  const box = current?.box ?? null;
  const showMissing = !!current?.missing;

  // Esperando o elemento aparecer: nada na tela ainda.
  if (!box && !showMissing) return null;

  const isLast = index === total - 1;
  const hole = box ? holeFromRect(box) : null;

  let popoverStyle: React.CSSProperties;
  let arrow: { side: string; offset: number } | null = null;
  if (hole && !isMobile) {
    const position = computePopoverPosition(hole, popoverSize, { width: vw, height: vh }, stop.placement ?? "auto");
    popoverStyle = { top: position.top, left: position.left, width: POPOVER_WIDTH };
    if (position.side !== "inside") arrow = { side: position.side, offset: position.arrowOffset };
  } else if (isMobile) {
    // Folha no rodapé, ou no topo quando o elemento está na metade de baixo da tela (senão ela o cobriria).
    const elementIsLow = !!hole && hole.top + hole.height / 2 > vh / 2;
    popoverStyle = elementIsLow ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: 12 };
  } else {
    popoverStyle = { top: "50%", left: "50%", width: POPOVER_WIDTH, transform: "translate(-50%, -50%)" };
  }

  const card = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      style={popoverStyle}
      className="fixed z-[72] max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-2xl ring-1 ring-black/5 motion-safe:animate-[tour-card-in_0.2s_ease-out] dark:bg-zinc-900 dark:ring-white/10"
    >
      {arrow ? (
        <span
          aria-hidden
          className={clsx("absolute size-3 rotate-45 bg-white dark:bg-zinc-900", {
            "-top-1.5": arrow.side === "bottom",
            "-bottom-1.5": arrow.side === "top",
            "-left-1.5": arrow.side === "right",
            "-right-1.5": arrow.side === "left",
          })}
          style={arrow.side === "bottom" || arrow.side === "top" ? { left: arrow.offset } : { top: arrow.offset }}
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-accent-600 dark:text-accent-300">{tour.title}</p>
          {!showMissing ? (
            <div className="mt-1.5 flex items-center gap-1" aria-label={`Passo ${index + 1} de ${total}`}>
              {tour.stops.map((s, i) => (
                <span
                  key={s.id}
                  className={clsx("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-accent-500" : i < index ? "w-1.5 bg-accent-300" : "w-1.5 bg-zinc-200 dark:bg-white/15")}
                />
              ))}
              <span className="ml-1.5 text-[11px] text-zinc-400">
                {index + 1}/{total}
              </span>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onStop} aria-label="Fechar tour" className="-mt-1 -mr-1 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white">
          <X size={18} />
        </button>
      </div>

      <h2 id={titleId} className="mt-3 font-display text-lg font-bold text-zinc-900 dark:text-white">
        {showMissing ? (stop.missing?.title ?? "Não encontramos este item na tela") : stop.title}
      </h2>
      <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-stone-300">
        {showMissing ? (stop.missing?.body ?? "Ele não está visível agora. Você pode seguir para o próximo ponto ou sair do tour.") : stop.body}
      </p>

      {!showMissing && stop.action ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-700 dark:bg-accent-500/15 dark:text-accent-200">
          <CursorClick size={15} weight="fill" />
          {stop.action}
        </p>
      ) : null}

      {!showMissing && stop.tip ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Lightbulb size={16} weight="fill" className="mt-0.5 shrink-0 text-amber-500" />
          <span>{stop.tip}</span>
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button type="button" onClick={onStop} className="rounded-full px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-stone-400 dark:hover:text-white">
          Pular tour
        </button>
        <div className="flex items-center gap-2">
          {index > 0 ? (
            <button type="button" onClick={goBack} className="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 ring-inset transition-colors hover:bg-zinc-900/5 dark:text-stone-200 dark:ring-white/20 dark:hover:bg-white/10">
              Voltar
            </button>
          ) : null}
          {showMissing && stop.missing?.goTo ? (
            <button
              type="button"
              onClick={() => {
                const goTo = stop.missing!.goTo!;
                onStart(goTo.tourId);
                router.push(TOURS[goTo.tourId].href);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-500/30 transition-colors hover:bg-accent-600"
            >
              {stop.missing.goTo.label}
              <ArrowRight size={15} weight="bold" />
            </button>
          ) : !showMissing && advanceOnClick ? (
            <span className="text-xs font-medium text-accent-600 dark:text-accent-300">Clique no destaque para continuar</span>
          ) : (
            <button
              type="button"
              onClick={() => (isLast ? onStop() : onGoTo(index + 1))}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-500/30 transition-colors hover:bg-accent-600"
            >
              {isLast ? "Entendi" : "Próximo"}
              {isLast ? null : <ArrowRight size={15} weight="bold" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Sem elemento (não apareceu a tempo): tela inteira escurecida e o balão no centro.
  if (!hole) {
    return createPortal(
      <>
        <div aria-hidden className={clsx("fixed inset-0 z-[70]", DIM)} />
        {card}
      </>,
      document.body,
    );
  }

  const top = Math.max(0, hole.top);
  const left = Math.max(0, hole.left);
  const right = Math.min(vw, hole.left + hole.width);
  const bottom = Math.min(vh, hole.top + hole.height);

  return createPortal(
    <>
      {/* Quatro faixas transparentes travam o clique FORA do destaque; o miolo (o elemento) fica livre. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-[70]" style={{ height: top }} />
      <div aria-hidden className="fixed inset-x-0 bottom-0 z-[70]" style={{ top: bottom }} />
      <div aria-hidden className="fixed left-0 z-[70]" style={{ top, width: left, height: Math.max(0, bottom - top) }} />
      <div aria-hidden className="fixed right-0 z-[70]" style={{ top, left: right, height: Math.max(0, bottom - top) }} />
      {/* O escurecimento é a sombra gigante de um retângulo de cantos arredondados: o "buraco" fica redondo, com anel. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] rounded-2xl"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, boxShadow: "0 0 0 100vmax rgb(9 9 11 / 0.65)" }}
      />
      {/* Anel pulsante em elemento à parte: a animação mexe no box-shadow e apagaria a sombra que escurece a tela. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[71] rounded-2xl ring-2 ring-accent-500 motion-safe:animate-[tour-ring_1.8s_ease-in-out_infinite]"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      />
      {card}
    </>,
    document.body,
  );
}

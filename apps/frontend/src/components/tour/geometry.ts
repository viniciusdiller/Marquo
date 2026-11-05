// Posicionamento do balão do tour em relação ao elemento destacado. Funções puras (sem DOM) para testar sem layout.
export type Placement = "top" | "bottom" | "left" | "right";

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  // Lado do balão que encosta no elemento (a seta fica nele). `inside`: não coube em lugar nenhum, o balão fica
  // flutuando sobre a tela (elemento maior que a janela) e sem seta.
  side: Placement | "inside";
  // Posição da seta ao longo da borda, em px a partir do canto do balão.
  arrowOffset: number;
}

const GAP = 14;
const MARGIN = 12;
export const ARROW_SIZE = 12;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

// Escolhe o lado com mais espaço quando o `preferred` não cabe; nunca deixa o balão sair da janela.
export function computePopoverPosition(
  target: Box,
  popover: Size,
  viewport: Size,
  preferred: Placement | "auto" = "auto",
): PopoverPosition {
  const space: Record<Placement, number> = {
    top: target.top - MARGIN,
    bottom: viewport.height - (target.top + target.height) - MARGIN,
    left: target.left - MARGIN,
    right: viewport.width - (target.left + target.width) - MARGIN,
  };
  const need: Record<Placement, number> = {
    top: popover.height + GAP,
    bottom: popover.height + GAP,
    left: popover.width + GAP,
    right: popover.width + GAP,
  };
  const fits = (side: Placement) => space[side] >= need[side];

  const order: Placement[] = ["bottom", "top", "right", "left"];
  let side: Placement | null = null;
  if (preferred !== "auto" && fits(preferred)) side = preferred;
  if (!side) side = order.find(fits) ?? null;
  if (!side) {
    return {
      side: "inside",
      top: clamp(viewport.height - popover.height - MARGIN * 2, MARGIN, viewport.height),
      left: clamp((viewport.width - popover.width) / 2, MARGIN, viewport.width - popover.width - MARGIN),
      arrowOffset: 0,
    };
  }

  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  let top: number;
  let left: number;
  if (side === "bottom" || side === "top") {
    left = clamp(centerX - popover.width / 2, MARGIN, viewport.width - popover.width - MARGIN);
    top = side === "bottom" ? target.top + target.height + GAP : target.top - popover.height - GAP;
  } else {
    top = clamp(centerY - popover.height / 2, MARGIN, viewport.height - popover.height - MARGIN);
    left = side === "right" ? target.left + target.width + GAP : target.left - popover.width - GAP;
  }

  const arrowOffset =
    side === "bottom" || side === "top"
      ? clamp(centerX - left - ARROW_SIZE / 2, 16, popover.width - 16 - ARROW_SIZE)
      : clamp(centerY - top - ARROW_SIZE / 2, 16, popover.height - 16 - ARROW_SIZE);

  return { side, top, left, arrowOffset };
}

// Retângulo do "buraco" iluminado: o elemento com uma folga, cortado pelos limites da janela.
export function holeFromRect(rect: Box, padding = 8): Box {
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

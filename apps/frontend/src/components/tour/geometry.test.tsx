import { describe, expect, it } from "vitest";
import { computePopoverPosition, holeFromRect, sameBox } from "./geometry";

const VIEWPORT = { width: 1280, height: 800 };
const POPOVER = { width: 360, height: 240 };

describe("computePopoverPosition", () => {
  it("prefere embaixo e centraliza no elemento", () => {
    const target = { top: 100, left: 500, width: 200, height: 40 };
    const p = computePopoverPosition(target, POPOVER, VIEWPORT, "bottom");
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(100 + 40 + 14);
    expect(p.left).toBe(600 - 180);
  });

  it("sem espaço embaixo, sobe para cima do elemento", () => {
    const target = { top: 700, left: 500, width: 200, height: 40 };
    const p = computePopoverPosition(target, POPOVER, VIEWPORT, "bottom");
    expect(p.side).toBe("top");
    expect(p.top).toBe(700 - 240 - 14);
  });

  it("'auto' escolhe o lado que cabe, na ordem embaixo, em cima, direita, esquerda", () => {
    expect(computePopoverPosition({ top: 100, left: 100, width: 100, height: 40 }, POPOVER, VIEWPORT).side).toBe("bottom");
    const tall = { top: 20, left: 20, width: 300, height: 760 };
    expect(computePopoverPosition(tall, POPOVER, VIEWPORT).side).toBe("right");
  });

  it("nunca deixa o balão sair da janela (elemento colado na borda)", () => {
    const target = { top: 100, left: 1200, width: 70, height: 40 };
    const p = computePopoverPosition(target, POPOVER, VIEWPORT, "bottom");
    expect(p.left + POPOVER.width).toBeLessThanOrEqual(VIEWPORT.width - 12);
    expect(p.left).toBeGreaterThanOrEqual(12);
  });

  it("a seta aponta para o centro do elemento e fica dentro do balão", () => {
    const target = { top: 100, left: 1200, width: 70, height: 40 };
    const p = computePopoverPosition(target, POPOVER, VIEWPORT, "bottom");
    expect(p.arrowOffset).toBeGreaterThanOrEqual(16);
    expect(p.arrowOffset).toBeLessThanOrEqual(POPOVER.width - 16 - 12);
  });

  it("elemento do tamanho da janela: balão flutuante embaixo, sem seta ('inside')", () => {
    const huge = { top: 0, left: 0, width: 1280, height: 800 };
    const p = computePopoverPosition(huge, POPOVER, VIEWPORT, "auto");
    expect(p.side).toBe("inside");
    expect(p.top + POPOVER.height).toBeLessThanOrEqual(VIEWPORT.height);
  });
});

describe("holeFromRect / sameBox", () => {
  it("dá uma folga em volta do elemento", () => {
    expect(holeFromRect({ top: 100, left: 50, width: 200, height: 40 }, 8)).toEqual({ top: 92, left: 42, width: 216, height: 56 });
  });

  it("compara caixas arredondando (ignora diferença de subpixel)", () => {
    const a = { top: 10.2, left: 20.4, width: 100.1, height: 30.3 };
    expect(sameBox(a, { top: 10, left: 20, width: 100, height: 30 })).toBe(true);
    expect(sameBox(a, { top: 11, left: 20, width: 100, height: 30 })).toBe(false);
    expect(sameBox(null, null)).toBe(true);
    expect(sameBox(a, null)).toBe(false);
  });
});

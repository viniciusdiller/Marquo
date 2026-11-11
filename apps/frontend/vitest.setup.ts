import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sem "globals: true" no vitest.config, o auto-cleanup do RTL não se registra sozinho (ele
// só chama afterEach se a função já estiver no escopo global) — sem isto, cada teste deixava
// o DOM do teste anterior montado, e getByText/getByRole passavam a achar duplicata.
afterEach(() => {
  cleanup();
});

// jsdom não tem ResizeObserver nem scrollIntoView (o Popover do Radix e as colunas do seletor de hora usam).
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

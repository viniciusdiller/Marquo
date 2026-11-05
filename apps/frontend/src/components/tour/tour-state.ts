import type { TenantSetupStepId } from "@marquo/shared-types";
import { isTourId, TOURS } from "./tours";

export interface TourState {
  tourId: TenantSetupStepId;
  index: number;
}

// O tour atravessa telas (Profissionais → ficha do profissional), então o estado vive no sessionStorage (some ao fechar a
// aba) e é lido como store externa: o React sempre vê o valor atual, sem setState em efeito.
const KEY = "marquo:tour";
const EVENT = "marquo:tour-change";

let cachedRaw: string | null = null;
let cachedState: TourState | null = null;

function parse(raw: string | null): TourState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { tourId?: unknown; index?: unknown };
    if (!isTourId(value.tourId)) return null;
    const stops = TOURS[value.tourId].stops.length;
    if (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0 || value.index >= stops) return null;
    return { tourId: value.tourId, index: value.index };
  } catch {
    return null;
  }
}

export function readTourState(): TourState | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  // Mesmo texto = mesmo objeto (o useSyncExternalStore exige snapshot estável).
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parse(raw);
  }
  return cachedState;
}

export function writeTourState(next: TourState | null): void {
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Navegação privada/sem storage: o tour simplesmente não persiste.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTourState(notify: () => void): () => void {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

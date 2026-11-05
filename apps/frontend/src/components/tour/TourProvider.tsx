"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { TenantSetupStepId } from "@marquo/shared-types";
import { readTourState, subscribeTourState, writeTourState, type TourState } from "./tour-state";
import { TourOverlay } from "./TourOverlay";

interface TourApi {
  active: TourState | null;
  start: (tourId: TenantSetupStepId) => void;
  goTo: (index: number) => void;
  stop: () => void;
}

const NOOP: TourApi = { active: null, start: () => undefined, goTo: () => undefined, stop: () => undefined };
const TourContext = createContext<TourApi>(NOOP);

// Sem provider (testes de componentes isolados) o hook vira no-op: nada quebra, só não há tour.
export function useTour(): TourApi {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const active = useSyncExternalStore(subscribeTourState, readTourState, () => null);

  const start = useCallback((tourId: TenantSetupStepId) => writeTourState({ tourId, index: 0 }), []);
  const stop = useCallback(() => writeTourState(null), []);
  const goTo = useCallback(
    (index: number) => {
      const current = readTourState();
      if (current) writeTourState({ tourId: current.tourId, index });
    },
    [],
  );

  const api = useMemo<TourApi>(() => ({ active, start, goTo, stop }), [active, start, goTo, stop]);

  return (
    <TourContext.Provider value={api}>
      {children}
      <TourOverlay active={active} onGoTo={goTo} onStop={stop} onStart={start} />
    </TourContext.Provider>
  );
}

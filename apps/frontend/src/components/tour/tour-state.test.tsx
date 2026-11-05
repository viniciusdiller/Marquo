import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTourState, subscribeTourState, writeTourState } from "./tour-state";

describe("estado do tour (sessionStorage)", () => {
  beforeEach(() => sessionStorage.clear());

  it("começa sem tour e guarda tour + ponto", () => {
    expect(readTourState()).toBeNull();
    writeTourState({ tourId: "services", index: 2 });
    expect(readTourState()).toEqual({ tourId: "services", index: 2 });
  });

  it("devolve o MESMO objeto enquanto nada muda (snapshot estável do useSyncExternalStore)", () => {
    writeTourState({ tourId: "services", index: 1 });
    expect(readTourState()).toBe(readTourState());
  });

  it("limpar remove o tour", () => {
    writeTourState({ tourId: "location", index: 0 });
    writeTourState(null);
    expect(readTourState()).toBeNull();
  });

  it("ignora valor adulterado ou antigo (tour desconhecido, índice fora da faixa, JSON quebrado)", () => {
    for (const raw of [
      JSON.stringify({ tourId: "hacker", index: 0 }),
      JSON.stringify({ tourId: "services", index: 99 }),
      JSON.stringify({ tourId: "services", index: -1 }),
      JSON.stringify({ tourId: "services", index: 1.5 }),
      JSON.stringify({ tourId: "services", index: "1" }),
      "{quebrado",
    ]) {
      sessionStorage.setItem("marquo:tour", raw);
      expect(readTourState()).toBeNull();
    }
  });

  it("avisa quem está assinando quando o estado muda", () => {
    const notify = vi.fn();
    const unsubscribe = subscribeTourState(notify);
    writeTourState({ tourId: "contact", index: 0 });
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeTourState(null);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

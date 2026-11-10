import { describe, expect, it } from "vitest";
import { blockedMessage } from "./gate";

describe("blockedMessage", () => {
  it("no período de teste explica que o teste usa o plano de entrada e que escolher plano no cadastro não ativa nada", () => {
    const m = blockedMessage({ onTrial: true, planName: null });
    expect(m.title).toMatch(/período de teste/i);
    expect(m.description).toMatch(/Essencial/);
    expect(m.description).toMatch(/Escolher um plano no cadastro não ativa nada/);
  });

  it("com plano assinado sem clube cita o plano atual", () => {
    const m = blockedMessage({ onTrial: false, planName: "Essencial" });
    expect(m.title).toBe("Disponível nos planos Profissional e Premium");
    expect(m.description).toMatch(/\(Essencial\)/);
  });

  it("sem nome de plano não quebra a frase", () => {
    expect(blockedMessage({ onTrial: false, planName: null }).description).toMatch(/^Seu plano atual não inclui/);
  });
});

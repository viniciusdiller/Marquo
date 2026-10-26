import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const setTrialAction = vi.fn();
vi.mock("../actions", () => ({ setTrialAction: (...args: unknown[]) => setTrialAction(...args) }));

import { TrialSetter } from "./TrialSetter";
import { trialRemainingLabel } from "@/lib/platform-api";

const ID = "3f2b8f0e-0000-4000-8000-000000000001";
const field = () => screen.getByLabelText(/dias de teste a partir de hoje/i);
const save = () => screen.getByRole("button", { name: /^salvar$/i });

describe("TrialSetter", () => {
  beforeEach(() => {
    setTrialAction.mockReset();
    refresh.mockReset();
  });

  it("começa com os dias que faltam e salva o valor digitado (para mais ou para menos)", async () => {
    setTrialAction.mockResolvedValue({ ok: true });
    render(<TrialSetter tenantId={ID} tenantName="Salão da Ana" currentDays={9} />);
    expect(field()).toHaveValue(9);

    await userEvent.clear(field());
    await userEvent.type(field(), "3");
    await userEvent.click(save());

    await waitFor(() => expect(setTrialAction).toHaveBeenCalledWith(ID, 3));
    expect(await screen.findByRole("status")).toHaveTextContent(/salvo/i);
    expect(refresh).toHaveBeenCalled();
  });

  it("teste já vencido sugere 14 dias em vez de um valor negativo", () => {
    render(<TrialSetter tenantId={ID} tenantName="S" currentDays={-6} />);
    expect(field()).toHaveValue(14);
  });

  it("os atalhos só preenchem o campo: nada é salvo até clicar em Salvar", async () => {
    render(<TrialSetter tenantId={ID} tenantName="S" currentDays={5} />);
    await userEvent.click(screen.getByRole("button", { name: "30 dias" }));
    expect(field()).toHaveValue(30);
    expect(setTrialAction).not.toHaveBeenCalled();
  });

  it("'Encerrar agora' coloca 0 no campo e salvar encerra o teste", async () => {
    setTrialAction.mockResolvedValue({ ok: true });
    render(<TrialSetter tenantId={ID} tenantName="S" currentDays={5} />);
    await userEvent.click(screen.getByRole("button", { name: /encerrar agora/i }));
    expect(field()).toHaveValue(0);
    await userEvent.click(save());
    await waitFor(() => expect(setTrialAction).toHaveBeenCalledWith(ID, 0));
  });

  it("trava o botão com valor vazio, negativo, decimal ou acima de 365", async () => {
    render(<TrialSetter tenantId={ID} tenantName="S" currentDays={5} />);
    for (const bad of ["", "-1", "1.5", "366"]) {
      await userEvent.clear(field());
      if (bad) await userEvent.type(field(), bad);
      expect(save()).toBeDisabled();
    }
    await userEvent.clear(field());
    await userEvent.type(field(), "365");
    expect(save()).toBeEnabled();
  });

  it("erro do backend aparece e não mostra 'Salvo'", async () => {
    setTrialAction.mockResolvedValue({ ok: false, error: "Este negócio já tem assinatura." });
    render(<TrialSetter tenantId={ID} tenantName="S" currentDays={5} />);
    await userEvent.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent(/já tem assinatura/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("trialRemainingLabel", () => {
  it("fala em dias no singular e no plural, e distingue vencido", () => {
    expect(trialRemainingLabel({ daysLeft: 1, expired: false })).toBe("Falta 1 dia");
    expect(trialRemainingLabel({ daysLeft: 12, expired: false })).toBe("Faltam 12 dias");
    expect(trialRemainingLabel({ daysLeft: 0, expired: true })).toBe("Venceu hoje");
    expect(trialRemainingLabel({ daysLeft: -1, expired: true })).toBe("Venceu há 1 dia");
    expect(trialRemainingLabel({ daysLeft: -8, expired: true })).toBe("Venceu há 8 dias");
  });
});

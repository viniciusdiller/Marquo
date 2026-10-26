import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const setPlanPriceAction = vi.fn();
vi.mock("../actions", () => ({ setPlanPriceAction: (...args: unknown[]) => setPlanPriceAction(...args) }));

import { PlanPriceEditor } from "./PlanPriceEditor";
import type { PlatformPlanPrice } from "@/lib/platform-api";

const PLAN: PlatformPlanPrice = {
  tier: "ESSENCIAL",
  name: "Essencial",
  priceCents: 4990,
  listPriceCents: 4990,
  minPriceCents: 500,
  maxPriceCents: 100_000,
  maxProfessionals: 2,
  cardSubscribers: 0,
};
const field = () => screen.getByLabelText(/novo preço mensal/i);
const save = () => screen.getByRole("button", { name: /salvar preço/i });

describe("PlanPriceEditor", () => {
  beforeEach(() => {
    setPlanPriceAction.mockReset();
    refresh.mockReset();
  });

  it("começa no preço atual com o botão desligado (nada mudou)", () => {
    render(<PlanPriceEditor plan={PLAN} />);
    expect(field()).toHaveValue("49,90");
    expect(save()).toBeDisabled();
  });

  it("salva o valor digitado em reais e atualiza a tela", async () => {
    setPlanPriceAction.mockResolvedValue({ ok: true });
    render(<PlanPriceEditor plan={PLAN} />);

    await userEvent.clear(field());
    await userEvent.type(field(), "3990");
    await userEvent.click(save());

    await waitFor(() => expect(setPlanPriceAction).toHaveBeenCalledWith("ESSENCIAL", "39,90"));
    expect(await screen.findByRole("status")).toHaveTextContent(/preço salvo/i);
    expect(refresh).toHaveBeenCalled();
  });

  it("permite AUMENTAR acima do preço de tabela, com aviso", async () => {
    setPlanPriceAction.mockResolvedValue({ ok: true });
    render(<PlanPriceEditor plan={PLAN} />);

    await userEvent.clear(field());
    await userEvent.type(field(), "5990");
    expect(screen.getByText(/aumento: vale para quem assinar/i)).toBeInTheDocument();
    expect(save()).toBeEnabled();

    await userEvent.click(save());
    await waitFor(() => expect(setPlanPriceAction).toHaveBeenCalledWith("ESSENCIAL", "59,90"));
  });

  it("abaixo do piso ou acima do teto: avisa e não deixa salvar", async () => {
    render(<PlanPriceEditor plan={PLAN} />);

    await userEvent.clear(field());
    await userEvent.type(field(), "300");
    expect(screen.getByRole("alert")).toHaveTextContent(/entre R\$\s?5,00 e R\$\s?1\.000,00/);
    expect(save()).toBeDisabled();

    await userEvent.clear(field());
    await userEvent.type(field(), "100001");
    expect(save()).toBeDisabled();
    expect(setPlanPriceAction).not.toHaveBeenCalled();
  });

  it("mostra o erro devolvido pelo servidor e não marca como salvo", async () => {
    setPlanPriceAction.mockResolvedValue({ ok: false, error: "O Profissional precisa custar mais que o plano anterior." });
    render(<PlanPriceEditor plan={PLAN} />);

    await userEvent.clear(field());
    await userEvent.type(field(), "3990");
    await userEvent.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent(/precisa custar mais/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("em promoção: oferece voltar ao preço de tabela (só preenche, não salva) e avisa dos assinantes de cartão", async () => {
    render(<PlanPriceEditor plan={{ ...PLAN, priceCents: 3990, cardSubscribers: 2 }} />);
    expect(screen.getByText(/2 assinantes no cartão não mudam de valor/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /voltar ao preço de tabela/i }));
    expect(field()).toHaveValue("49,90");
    expect(setPlanPriceAction).not.toHaveBeenCalled();
  });

  it("preço reajustado acima da tabela mostra o selo e também oferece voltar ao preço de tabela", async () => {
    render(<PlanPriceEditor plan={{ ...PLAN, priceCents: 5990 }} />);
    expect(screen.getByText("reajustado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /voltar ao preço de tabela/i }));
    expect(field()).toHaveValue("49,90");
  });
});

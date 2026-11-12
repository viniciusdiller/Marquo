import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  quoteChangePlanAction: vi.fn(),
  changePlanAction: vi.fn(),
  attemptStatusAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ChangePlanDialog } from "./ChangePlanDialog";
import type { PlanInfo } from "@/lib/billing";

const PRO: PlanInfo = { tier: "PROFISSIONAL", name: "Profissional", priceCents: 9990, maxProfessionals: 5 };
const PREMIUM: PlanInfo = { tier: "PREMIUM", name: "Premium", priceCents: 18990, maxProfessionals: null };
const ESSENCIAL: PlanInfo = { tier: "ESSENCIAL", name: "Essencial", priceCents: 4990, maxProfessionals: 2 };

const upgradeQuote = {
  tier: "PREMIUM", planName: "Premium", kind: "PAYMENT", newPriceCents: 18990, currentPriceCents: 9990,
  chargeCents: 4500, remainingDays: 15, effective: "O plano novo vale assim que o Pix for confirmado.",
};
const downgradeQuote = {
  tier: "ESSENCIAL", planName: "Essencial", kind: "IMMEDIATE", newPriceCents: 4990, currentPriceCents: 9990,
  chargeCents: null, remainingDays: null, effective: "O novo valor passa a valer na próxima cobrança.",
};
const pix = { attemptId: "a1", chargeCents: 4500, expiresAt: new Date().toISOString(), qrCode: "000201", qrCodeBase64: null, ticketUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  actions.attemptStatusAction.mockResolvedValue({ ok: true, attempt: { status: "PENDING", method: "PIX_MONTHLY" } });
});

describe("ChangePlanDialog: upgrade cobra a diferença", () => {
  it("mostra o valor que o SERVIDOR calculou e oferece gerar o Pix da diferença", async () => {
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: upgradeQuote });
    render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);

    expect(await screen.findByText(/você paga agora só a diferença proporcional/)).toHaveTextContent(/R\$\s?45,00/);
    expect(screen.getByText(/15 dia\(s\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar Pix da diferença/ })).toBeEnabled();
    expect(actions.quoteChangePlanAction).toHaveBeenCalledWith("PREMIUM");
  });

  it("confirmar NÃO troca o plano na tela: mostra o Pix e espera o pagamento; só envia o plano (nenhum valor)", async () => {
    const user = userEvent.setup();
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: upgradeQuote });
    actions.changePlanAction.mockResolvedValue({ ok: true, outcome: { applied: false, planName: "Premium", pix } });
    render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: /Gerar Pix da diferença/ }));

    expect(await screen.findByText(/Pague a diferença para o plano Premium/)).toBeInTheDocument();
    expect(screen.getByText(/Aguardando o pagamento/)).toBeInTheDocument();
    expect(screen.queryByText(/Plano alterado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pagamento confirmado/)).not.toBeInTheDocument();
    // O cliente só informa QUAL plano: nada de valor, desconto ou data.
    expect(actions.changePlanAction).toHaveBeenCalledWith("PREMIUM", undefined);
  });

  it("só confirma 'plano alterado' depois que o backend diz que o Pix foi APROVADO", async () => {
    const user = userEvent.setup();
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: upgradeQuote });
    actions.changePlanAction.mockResolvedValue({ ok: true, outcome: { applied: false, planName: "Premium", pix } });
    actions.attemptStatusAction.mockResolvedValue({ ok: true, attempt: { status: "APPROVED", method: "PIX_MONTHLY", kind: "PLAN_UPGRADE" } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);
      await user.click(await screen.findByRole("button", { name: /Gerar Pix da diferença/ }));
      await vi.advanceTimersByTimeAsync(4500);
      expect(await screen.findByText(/Pagamento confirmado!/)).toBeInTheDocument();
      expect(screen.getByText(/Agora você está no plano Premium/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Pix recusado ou expirado volta ao diálogo com o aviso, sem trocar nada", async () => {
    const user = userEvent.setup();
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: upgradeQuote });
    actions.changePlanAction.mockResolvedValue({ ok: true, outcome: { applied: false, planName: "Premium", pix } });
    actions.attemptStatusAction.mockResolvedValue({ ok: true, attempt: { status: "EXPIRED", method: "PIX_MONTHLY" } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);
      await user.click(await screen.findByRole("button", { name: /Gerar Pix da diferença/ }));
      await vi.advanceTimersByTimeAsync(4500);
      expect(await screen.findByText(/Este Pix expirou ou foi recusado/)).toBeInTheDocument();
      expect(screen.queryByText(/Pagamento confirmado/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("se o backend não conhece o cliente no provedor, pede o CPF/CNPJ e reenvia com ele", async () => {
    const user = userEvent.setup();
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: upgradeQuote });
    actions.changePlanAction
      .mockResolvedValueOnce({ ok: false, error: "Informe o CPF ou CNPJ de quem vai pagar." })
      .mockResolvedValueOnce({ ok: true, outcome: { applied: false, planName: "Premium", pix } });
    render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: /Gerar Pix da diferença/ }));
    const field = await screen.findByLabelText(/CPF ou CNPJ de quem paga/);
    expect(screen.getByRole("button", { name: /Gerar Pix da diferença/ })).toBeDisabled();

    await user.type(field, "52998224725");
    await user.click(screen.getByRole("button", { name: /Gerar Pix da diferença/ }));

    await waitFor(() => expect(actions.changePlanAction).toHaveBeenLastCalledWith("PREMIUM", "529.982.247-25"));
    expect(await screen.findByText(/Pague a diferença/)).toBeInTheDocument();
  });

  it("não deixa confirmar enquanto o valor não chegou do servidor", async () => {
    actions.quoteChangePlanAction.mockReturnValue(new Promise(() => undefined));
    render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);
    expect(screen.getByText(/Calculando/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trocar de plano|Gerar Pix da diferença/ })).toBeDisabled();
  });

  it("erro da prévia (ex.: assinatura em atraso) aparece e a troca não é oferecida", async () => {
    actions.quoteChangePlanAction.mockResolvedValue({ ok: false, error: "Regularize o pagamento antes de trocar de plano." });
    render(<ChangePlanDialog from={PRO} to={PREMIUM} onClose={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Regularize o pagamento/);
    expect(screen.getByRole("button", { name: /Trocar de plano|Gerar Pix da diferença/ })).toBeDisabled();
  });
});

describe("ChangePlanDialog: plano mais barato vale na hora", () => {
  it("não cobra nada agora, explica que não há reembolso e confirma a troca", async () => {
    const user = userEvent.setup();
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: downgradeQuote });
    actions.changePlanAction.mockResolvedValue({
      ok: true,
      outcome: { applied: true, planName: "Essencial", effective: "O novo valor passa a valer na próxima cobrança." },
    });
    render(<ChangePlanDialog from={PRO} to={ESSENCIAL} onClose={() => undefined} />);

    expect(await screen.findByText(/não é devolvido/)).toBeInTheDocument();
    expect(screen.queryByText(/diferença proporcional/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Trocar de plano/ }));

    expect(await screen.findByText(/Agora você está no plano Essencial/)).toBeInTheDocument();
    expect(actions.changePlanAction).toHaveBeenCalledWith("ESSENCIAL", undefined);
  });

  it("equipe maior que o plano novo: o erro do servidor (com os números) aparece e nada é trocado", async () => {
    const user = userEvent.setup();
    actions.quoteChangePlanAction.mockResolvedValue({ ok: true, quote: downgradeQuote });
    actions.changePlanAction.mockResolvedValue({ ok: false, error: "Você tem 4 profissionais ativos, mas o plano Essencial permite no máximo 2." });
    render(<ChangePlanDialog from={PRO} to={ESSENCIAL} onClose={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: /Trocar de plano/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/4 profissionais ativos/);
    expect(screen.queryByText(/Agora você está/)).not.toBeInTheDocument();
  });
});

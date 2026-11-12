import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  quoteAction: vi.fn(),
  startCardAction: vi.fn(),
  startPixAction: vi.fn(),
  attemptStatusAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CheckoutDialog } from "./CheckoutDialog";
import type { PlanInfo } from "@/lib/billing";

const PLAN: PlanInfo = { tier: "PROFISSIONAL", name: "Profissional", priceCents: 9990, maxProfessionals: 5 };
const quote = { tier: "PROFISSIONAL", planName: "Profissional", listPriceCents: 9990, discountCents: 0, chargeCents: 9990, coupon: null, couponError: null };

beforeEach(() => {
  vi.clearAllMocks();
  actions.quoteAction.mockResolvedValue({ ok: true, quote });
});

const document = () => screen.getByLabelText(/CPF ou CNPJ de quem paga/);

describe("CheckoutDialog: documento do pagador (o Asaas exige CPF/CNPJ)", () => {
  it("pede o documento, com a máscara trocando de CPF para CNPJ conforme digita", async () => {
    const user = userEvent.setup();
    render(<CheckoutDialog plan={PLAN} onClose={() => undefined} />);
    expect(screen.getByText(/não fica salvo no Marquo/)).toBeInTheDocument();

    await user.type(document(), "52998224725");
    expect(document()).toHaveValue("529.982.247-25");

    await user.clear(document());
    await user.type(document(), "11222333000181");
    expect(document()).toHaveValue("11.222.333/0001-81");
  });

  it("sem documento (ou com tamanho errado) não chama o backend e avisa", async () => {
    const user = userEvent.setup();
    render(<CheckoutDialog plan={PLAN} onClose={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/CPF ou CNPJ/);

    await user.type(document(), "5299822");
    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));
    expect(actions.startCardAction).not.toHaveBeenCalled();
    expect(actions.startPixAction).not.toHaveBeenCalled();
  });

  it("Pix: envia plano, cupom e o documento digitado", async () => {
    const user = userEvent.setup();
    actions.startPixAction.mockResolvedValue({
      ok: true,
      pix: { attemptId: "a1", chargeCents: 9990, expiresAt: new Date().toISOString(), qrCode: "000201", qrCodeBase64: null, ticketUrl: null },
    });
    render(<CheckoutDialog plan={PLAN} onClose={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /Pix mensal/ }));
    await user.type(document(), "52998224725");
    await user.click(screen.getByRole("button", { name: /Gerar Pix/ }));

    await waitFor(() => expect(actions.startPixAction).toHaveBeenCalledWith("PROFISSIONAL", "", "529.982.247-25"));
    expect(await screen.findByText(/Pague com Pix/)).toBeInTheDocument();
    expect(actions.startCardAction).not.toHaveBeenCalled();
  });

  it("cartão: envia o documento e mostra o erro do backend (ex.: documento inválido) sem sair da tela", async () => {
    const user = userEvent.setup();
    actions.startCardAction.mockResolvedValue({ ok: false, error: "CPF ou CNPJ inválido." });
    render(<CheckoutDialog plan={PLAN} onClose={() => undefined} />);

    await user.type(document(), "52998224726");
    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));

    await waitFor(() => expect(actions.startCardAction).toHaveBeenCalledWith("PROFISSIONAL", "", "529.982.247-26"));
    expect(await screen.findByRole("alert")).toHaveTextContent("CPF ou CNPJ inválido.");
  });

  it("renovação do Pix também pede o documento", async () => {
    render(<CheckoutDialog plan={PLAN} onClose={() => undefined} mode="renew" />);
    expect(document()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar Pix/ })).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  quoteAction: vi.fn(),
  startCardAction: vi.fn(),
  startPixAction: vi.fn(),
  billingProfileAction: vi.fn(),
  attemptStatusAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CheckoutForm } from "./CheckoutForm";
import type { PlanInfo } from "@/lib/billing";

const PLAN: PlanInfo = { tier: "PROFISSIONAL", name: "Profissional", priceCents: 9990, maxProfessionals: 5 };
const quote = { tier: "PROFISSIONAL", planName: "Profissional", listPriceCents: 9990, discountCents: 0, chargeCents: 9990, coupon: null, couponError: null };

const EMPTY_PROFILE = {
  documentHint: null,
  phone: null,
  postalCode: null,
  address: null,
  addressNumber: null,
  complement: null,
  province: null,
  canStoreDocument: true,
  missingForCard: [],
  missingForPix: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  actions.quoteAction.mockResolvedValue({ ok: true, quote });
  actions.billingProfileAction.mockResolvedValue({ ok: true, profile: EMPTY_PROFILE });
});

const document = () => screen.getByLabelText(/CPF ou CNPJ de quem paga/);

describe("CheckoutForm (página de checkout): documento do pagador", () => {
  it("pede o documento, com a máscara trocando de CPF para CNPJ conforme digita", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm plan={PLAN} />);
    expect(screen.getByText(/Fica salvo criptografado/)).toBeInTheDocument();

    await user.type(document(), "52998224725");
    expect(document()).toHaveValue("529.982.247-25");

    await user.clear(document());
    await user.type(document(), "11222333000181");
    expect(document()).toHaveValue("11.222.333/0001-81");
  });

  it("sem documento (ou com tamanho errado) não chama o backend e avisa", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm plan={PLAN} />);

    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/CPF ou CNPJ/);

    await user.type(document(), "5299822");
    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));
    expect(actions.startCardAction).not.toHaveBeenCalled();
    expect(actions.startPixAction).not.toHaveBeenCalled();
  });

  it("Pix: envia plano, cupom e o documento digitado, sem pedir endereço", async () => {
    const user = userEvent.setup();
    actions.startPixAction.mockResolvedValue({
      ok: true,
      pix: { attemptId: "a1", chargeCents: 9990, expiresAt: new Date().toISOString(), qrCode: "000201", qrCodeBase64: null, ticketUrl: null },
    });
    render(<CheckoutForm plan={PLAN} />);

    await user.click(screen.getByRole("button", { name: /Pix mensal/ }));
    expect(screen.queryByLabelText("CEP")).not.toBeInTheDocument();
    await user.type(document(), "52998224725");
    await user.click(screen.getByRole("button", { name: /Gerar Pix/ }));

    await waitFor(() => expect(actions.startPixAction).toHaveBeenCalledWith("PROFISSIONAL", "", { cpfCnpj: "529.982.247-25" }));
    expect(await screen.findByText(/Pague com Pix/)).toBeInTheDocument();
    expect(actions.startCardAction).not.toHaveBeenCalled();
  });

  it("cartão: pede telefone e endereço, envia tudo e mostra o erro do backend sem sair da tela", async () => {
    const user = userEvent.setup();
    actions.startCardAction.mockResolvedValue({ ok: false, error: "CPF ou CNPJ inválido." });
    render(<CheckoutForm plan={PLAN} />);

    await user.type(document(), "52998224726");
    // Sem telefone e endereço o cartão nem chama o backend.
    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/telefone, CEP, rua, número e bairro/);
    expect(actions.startCardAction).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Telefone com DDD"), "11912345678");
    await user.type(screen.getByLabelText("CEP"), "01310100");
    await user.type(screen.getByLabelText("Número"), "1000");
    await user.type(screen.getByLabelText("Rua"), "Av. Paulista");
    await user.type(screen.getByLabelText("Bairro"), "Bela Vista");
    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));

    await waitFor(() =>
      expect(actions.startCardAction).toHaveBeenCalledWith("PROFISSIONAL", "", {
        cpfCnpj: "529.982.247-26",
        phone: "(11) 91234-5678",
        postalCode: "01310-100",
        address: "Av. Paulista",
        addressNumber: "1000",
        complement: "",
        province: "Bela Vista",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("CPF ou CNPJ inválido.");
  });

  it("com cadastro salvo: mostra o documento mascarado, pré-preenche o endereço e não pede nada de novo", async () => {
    const user = userEvent.setup();
    actions.billingProfileAction.mockResolvedValue({
      ok: true,
      profile: {
        ...EMPTY_PROFILE,
        documentHint: "***.***.***-25",
        phone: "11912345678",
        postalCode: "01310100",
        address: "Av. Paulista",
        addressNumber: "1000",
        province: "Bela Vista",
      },
    });
    actions.startCardAction.mockResolvedValue({ ok: false, error: "x" });
    render(<CheckoutForm plan={PLAN} />);

    expect(await screen.findByText("***.***.***-25")).toBeInTheDocument();
    expect(screen.queryByLabelText(/CPF ou CNPJ de quem paga/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Rua")).toHaveValue("Av. Paulista"));

    await user.click(screen.getByRole("button", { name: /Ir para o pagamento/ }));
    // O documento salvo não é reenviado: o servidor usa o que está criptografado no banco.
    await waitFor(() =>
      expect(actions.startCardAction).toHaveBeenCalledWith(
        "PROFISSIONAL",
        "",
        expect.objectContaining({ cpfCnpj: "", postalCode: "01310-100", address: "Av. Paulista" }),
      ),
    );
  });

  it("'Trocar' volta a pedir o documento", async () => {
    const user = userEvent.setup();
    actions.billingProfileAction.mockResolvedValue({ ok: true, profile: { ...EMPTY_PROFILE, documentHint: "***.***.***-25" } });
    render(<CheckoutForm plan={PLAN} />);
    await user.click(await screen.findByRole("button", { name: "Trocar" }));
    expect(document()).toBeInTheDocument();
  });

  it("renovação do Pix também pede o documento e mostra o resumo do pedido", async () => {
    render(<CheckoutForm plan={PLAN} mode="renew" />);
    expect(document()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar Pix/ })).toBeInTheDocument();
    expect(await screen.findByLabelText("Resumo do pedido")).toHaveTextContent(/R\$\s?99,90/);
  });

  it("'Voltar aos planos' leva de volta para a tela de planos", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm plan={PLAN} />);
    await user.click(screen.getByRole("button", { name: /Voltar aos planos/ }));
    expect(router.push).toHaveBeenCalledWith("/dashboard/plano");
  });

  it("cupom: aplica no resumo e mostra o desconto vindo do backend", async () => {
    const user = userEvent.setup();
    actions.quoteAction
      .mockResolvedValueOnce({ ok: true, quote })
      .mockResolvedValueOnce({
        ok: true,
        quote: { ...quote, discountCents: 2000, chargeCents: 7990, coupon: { code: "PROMO20", kind: "FIXED_CENTS", value: 2000, fromSignup: false } },
      });
    render(<CheckoutForm plan={PLAN} />);

    await user.type(screen.getByLabelText(/Cupom de desconto/), "promo20");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(actions.quoteAction).toHaveBeenLastCalledWith("PROFISSIONAL", "PROMO20"));
    expect(await screen.findByText(/Cupom PROMO20/)).toBeInTheDocument();
    expect(screen.getByText(/Primeira cobrança/)).toBeInTheDocument();
  });
});

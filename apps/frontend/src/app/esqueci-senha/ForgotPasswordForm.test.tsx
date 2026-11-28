import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const forgotPasswordAction = vi.fn();
const resetConsumerPasswordAction = vi.fn();
vi.mock("./actions", () => ({
  forgotPasswordAction: (...args: unknown[]) => forgotPasswordAction(...args),
  resetConsumerPasswordAction: (...args: unknown[]) => resetConsumerPasswordAction(...args),
}));

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    forgotPasswordAction.mockReset();
    resetConsumerPasswordAction.mockReset();
  });

  it("envia o e-mail e mostra a confirmação neutra para os dois tipos de conta (sem dizer se existe)", async () => {
    forgotPasswordAction.mockResolvedValue({ sent: true, email: "ana@salao.com" });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/e-mail da conta/i), "ana@salao.com");
    await userEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/se o e-mail informado estiver cadastrado/i);
    expect(status).toHaveTextContent(/conta do negócio/i);
    expect(status).toHaveTextContent(/conta de cliente/i);
    const formData = forgotPasswordAction.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("ana@salao.com");
  });

  it("depois do envio, o cliente digita o código e a nova senha (com o e-mail pedido)", async () => {
    forgotPasswordAction.mockResolvedValue({ sent: true, email: "ana@salao.com" });
    resetConsumerPasswordAction.mockResolvedValue({ error: "Código inválido ou expirado. Peça um novo código." });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/e-mail da conta/i), "ana@salao.com");
    await userEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    await userEvent.type(await screen.findByLabelText(/^código/i), "123456");
    await userEvent.type(screen.getByLabelText(/^nova senha/i), "nova-senha-123");
    await userEvent.type(screen.getByLabelText(/confirmar nova senha/i), "nova-senha-123");
    await userEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/código inválido ou expirado/i);
    const formData = resetConsumerPasswordAction.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("ana@salao.com");
    expect(formData.get("code")).toBe("123456");
    expect(formData.get("password")).toBe("nova-senha-123");
  });

  it("mostra o erro devolvido pela action e mantém o formulário", async () => {
    forgotPasswordAction.mockResolvedValue({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/e-mail da conta/i), "ana@salao.com");
    await userEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/muitas tentativas/i);
    expect(screen.getByRole("button", { name: /^enviar$/i })).toBeInTheDocument();
  });
});

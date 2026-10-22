import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const forgotPasswordAction = vi.fn();
vi.mock("./actions", () => ({ forgotPasswordAction: (...args: unknown[]) => forgotPasswordAction(...args) }));

describe("ForgotPasswordForm", () => {
  beforeEach(() => forgotPasswordAction.mockReset());

  it("envia o e-mail digitado e mostra a confirmação neutra (sem dizer se a conta existe)", async () => {
    forgotPasswordAction.mockResolvedValue({ sent: true });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/e-mail da conta/i), "ana@salao.com");
    await userEvent.click(screen.getByRole("button", { name: /enviar link/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/se o e-mail informado estiver cadastrado/i);
    const formData = forgotPasswordAction.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("ana@salao.com");
  });

  it("mostra o erro devolvido pela action e mantém o formulário", async () => {
    forgotPasswordAction.mockResolvedValue({ error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/e-mail da conta/i), "ana@salao.com");
    await userEvent.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/muitas tentativas/i);
    expect(screen.getByRole("button", { name: /enviar link/i })).toBeInTheDocument();
  });
});

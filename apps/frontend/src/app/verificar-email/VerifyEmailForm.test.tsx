import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyEmailForm } from "./VerifyEmailForm";

const verifyEmailAction = vi.fn();
vi.mock("./actions", () => ({ verifyEmailAction: (...args: unknown[]) => verifyEmailAction(...args) }));

describe("VerifyEmailForm", () => {
  beforeEach(() => {
    verifyEmailAction.mockReset();
  });

  it("só confirma no CLIQUE: abrir a página não chama a ação (scanners de e-mail abrem links)", () => {
    render(<VerifyEmailForm token="abc" />);
    expect(verifyEmailAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirmar meu e-mail/i })).toBeInTheDocument();
  });

  it("clique envia o token e mostra o sucesso com o caminho para o login", async () => {
    verifyEmailAction.mockResolvedValue({ verified: true });
    render(<VerifyEmailForm token="abc123" />);

    await userEvent.click(screen.getByRole("button", { name: /confirmar meu e-mail/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/e-mail confirmado/i));
    expect((verifyEmailAction.mock.calls[0][1] as FormData).get("token")).toBe("abc123");
    expect(screen.getByRole("link", { name: /ir para o login/i })).toHaveAttribute("href", "/entrar");
  });

  it("link inválido ou vencido: mostra o erro do backend e mantém o botão", async () => {
    verifyEmailAction.mockResolvedValue({ error: "Este link de confirmação é inválido ou expirou." });
    render(<VerifyEmailForm token="velho" />);

    await userEvent.click(screen.getByRole("button", { name: /confirmar meu e-mail/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/inválido ou expirou/i);
    expect(screen.getByRole("button", { name: /confirmar meu e-mail/i })).toBeInTheDocument();
  });
});

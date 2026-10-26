import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const loginAction = vi.fn();
const resendVerificationAction = vi.fn();
vi.mock("../entrar/actions", () => ({
  loginAction: (...args: unknown[]) => loginAction(...args),
  resendVerificationAction: (...args: unknown[]) => resendVerificationAction(...args),
}));

const signup = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, publicApi: { ...actual.publicApi, signup: (...args: unknown[]) => signup(...args) } };
});

import { SignupForm } from "./SignupForm";

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/nome do seu negócio/i), "Barbearia do Zé");
  await userEvent.type(screen.getByLabelText(/^seu nome$/i), "José Silva");
  await userEvent.type(screen.getByLabelText(/^e-mail$/i), "ze@barbearia.com");
  await userEvent.type(screen.getByLabelText(/telefone/i), "11912345678");
  await userEvent.type(screen.getByLabelText(/crie uma senha/i), "senha-forte-123");
  await userEvent.type(screen.getByLabelText(/confirme a senha/i), "senha-forte-123");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: /criar conta/i }));
}

describe("SignupForm: confirmação de e-mail", () => {
  beforeEach(() => {
    signup.mockReset();
    loginAction.mockReset();
    resendVerificationAction.mockReset();
    replace.mockReset();
  });

  it("cadastro que exige confirmar: mostra a tela 'confirme seu e-mail' e NÃO tenta o login", async () => {
    signup.mockResolvedValue({ slug: "barbearia-do-ze", emailVerificationRequired: true });
    render(<SignupForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("status")).toHaveTextContent(/ze@barbearia\.com/);
    expect(screen.getByRole("status")).toHaveTextContent(/confirme seu e-mail/i);
    expect(loginAction).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("reenviar usa o e-mail do cadastro", async () => {
    signup.mockResolvedValue({ slug: "x", emailVerificationRequired: true });
    resendVerificationAction.mockResolvedValue({ ok: true });
    render(<SignupForm />);
    await fillAndSubmit();

    await userEvent.click(await screen.findByRole("button", { name: /reenviar e-mail/i }));

    await waitFor(() => expect(resendVerificationAction).toHaveBeenCalledWith("ze@barbearia.com"));
  });

  it("sem confirmação exigida (ex.: desenvolvimento): segue o fluxo antigo e entra direto", async () => {
    signup.mockResolvedValue({ slug: "x", emailVerificationRequired: false });
    loginAction.mockResolvedValue({ redirectTo: "/dashboard/agenda" });
    render(<SignupForm />);

    await fillAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/agenda"));
    expect(loginAction).toHaveBeenCalledWith("ze@barbearia.com", "senha-forte-123", "/dashboard/agenda");
  });

  it("se o login automático acusar e-mail não confirmado, cai na mesma tela de confirmação", async () => {
    signup.mockResolvedValue({ slug: "x" });
    loginAction.mockResolvedValue({ error: "Confirme seu e-mail.", code: "EMAIL_NOT_VERIFIED" });
    render(<SignupForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("status")).toHaveTextContent(/confirme seu e-mail/i);
  });
});

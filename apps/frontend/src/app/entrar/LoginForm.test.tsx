import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const loginAction = vi.fn();
const registerAction = vi.fn();
const resendVerificationAction = vi.fn();
const verifyPlatformCodeAction = vi.fn();
const requestRegisterCodeAction = vi.fn();
vi.mock("./actions", () => ({
  requestRegisterCodeAction: (...args: unknown[]) => requestRegisterCodeAction(...args),
  verifyPlatformCodeAction: (...args: unknown[]) => verifyPlatformCodeAction(...args),
  loginAction: (...args: unknown[]) => loginAction(...args),
  registerAction: (...args: unknown[]) => registerAction(...args),
  resendVerificationAction: (...args: unknown[]) => resendVerificationAction(...args),
}));

import { LoginForm } from "./LoginForm";

// O seletor Entrar/Criar conta também tem um botão "Entrar": o de envio é o type="submit".
const submitButton = () =>
  screen.getAllByRole("button", { name: /^entrar$/i }).find((b) => (b as HTMLButtonElement).type === "submit")!;

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/e-mail ou telefone/i), "dono@salao.com");
  await userEvent.type(screen.getByLabelText(/^senha$/i), "senha-correta-123");
  await userEvent.click(submitButton());
}

describe("LoginForm: e-mail não confirmado", () => {
  beforeEach(() => {
    loginAction.mockReset();
    resendVerificationAction.mockReset();
    replace.mockReset();
  });

  it("mostra a mensagem e o botão de reenviar quando a conta falta confirmar", async () => {
    loginAction.mockResolvedValue({ error: "Confirme seu e-mail para entrar.", code: "EMAIL_NOT_VERIFIED" });
    render(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/confirme seu e-mail/i);
    expect(screen.getByRole("button", { name: /reenviar e-mail de confirmação/i })).toBeInTheDocument();
  });

  it("reenviar chama a ação com o e-mail digitado e mostra o aviso neutro", async () => {
    loginAction.mockResolvedValue({ error: "Confirme seu e-mail para entrar.", code: "EMAIL_NOT_VERIFIED" });
    resendVerificationAction.mockResolvedValue({ ok: true });
    render(<LoginForm />);
    await fillAndSubmit();

    await userEvent.click(await screen.findByRole("button", { name: /reenviar e-mail de confirmação/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/se o e-mail estiver cadastrado/i));
    expect(resendVerificationAction).toHaveBeenCalledWith("dono@salao.com");
  });

  it("senha errada (erro genérico, sem código): NÃO oferece o botão de reenviar", async () => {
    loginAction.mockResolvedValue({ error: "E-mail/telefone ou senha incorretos." });
    render(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorretos/i);
    expect(screen.queryByRole("button", { name: /reenviar/i })).not.toBeInTheDocument();
  });

  it("um novo login com sucesso esconde o aviso e navega", async () => {
    loginAction.mockResolvedValueOnce({ error: "Confirme seu e-mail para entrar.", code: "EMAIL_NOT_VERIFIED" });
    loginAction.mockResolvedValueOnce({ redirectTo: "/dashboard/agenda" });
    render(<LoginForm />);
    await fillAndSubmit();
    await screen.findByRole("button", { name: /reenviar e-mail de confirmação/i });

    await userEvent.click(submitButton());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/agenda"));
    expect(screen.queryByRole("button", { name: /reenviar/i })).not.toBeInTheDocument();
  });

  it("link 'Esqueci minha senha' continua no formulário de login", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: /esqueci minha senha/i })).toHaveAttribute("href", "/esqueci-senha");
  });
});

describe("LoginForm: 2FA da plataforma", () => {
  beforeEach(() => {
    loginAction.mockReset();
    verifyPlatformCodeAction.mockReset();
    replace.mockReset();
  });

  async function reachCodeStep() {
    loginAction.mockResolvedValue({ needsCode: true, challengeId: "ab".repeat(24) });
    render(<LoginForm />);
    await fillAndSubmit();
    return screen.findByLabelText(/código de acesso/i);
  }

  it("senha certa com 2FA troca o formulário pela etapa do código (e some a senha da tela)", async () => {
    const field = await reachCodeStep();
    expect(field).toBeInTheDocument();
    expect(screen.queryByLabelText(/^senha$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar código/i })).toBeDisabled();
  });

  it("só habilita o envio com 6 dígitos e ignora o que não é número", async () => {
    const field = await reachCodeStep();
    await userEvent.type(field, "04a2-9 1");
    expect(field).toHaveValue("04291");
    expect(screen.getByRole("button", { name: /confirmar código/i })).toBeDisabled();

    await userEvent.type(field, "3");
    expect(field).toHaveValue("042913");
    expect(screen.getByRole("button", { name: /confirmar código/i })).toBeEnabled();
  });

  it("código certo: chama a ação com o desafio e navega para a plataforma", async () => {
    verifyPlatformCodeAction.mockResolvedValue({ redirectTo: "/plataforma" });
    const field = await reachCodeStep();
    await userEvent.type(field, "042913");
    await userEvent.click(screen.getByRole("button", { name: /confirmar código/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/plataforma"));
    expect(verifyPlatformCodeAction).toHaveBeenCalledWith("ab".repeat(24), "042913");
  });

  it("código errado: mostra o erro, limpa o campo e não navega", async () => {
    verifyPlatformCodeAction.mockResolvedValue({ error: "Código inválido ou expirado.", restart: true });
    const field = await reachCodeStep();
    await userEvent.type(field, "111111");
    await userEvent.click(screen.getByRole("button", { name: /confirmar código/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/inválido ou expirado/i);
    expect(replace).not.toHaveBeenCalled();
    expect(field).toHaveValue("");
  });

  it("'voltar e entrar de novo' devolve o formulário de senha", async () => {
    await reachCodeStep();
    await userEvent.click(screen.getByRole("button", { name: /voltar e entrar de novo/i }));
    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/código de acesso/i)).not.toBeInTheDocument();
  });
});

describe("LoginForm: cadastro de cliente com código no e-mail", () => {
  beforeEach(() => {
    registerAction.mockReset();
    requestRegisterCodeAction.mockReset();
    replace.mockReset();
  });

  async function fillRegisterAndSubmit() {
    await userEvent.click(screen.getAllByRole("button", { name: /^criar conta$/i })[0]);
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Ana Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11988887777");
    await userEvent.type(screen.getByLabelText(/^e-mail$/i), "ana@example.com");
    await userEvent.type(screen.getByLabelText(/crie uma senha/i), "senha-correta-123");
    await userEvent.type(screen.getByLabelText(/confirme a senha/i), "senha-correta-123");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
  }

  it("etapa 1: pede o código ao e-mail digitado e NÃO cria a conta ainda", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: true, required: true });
    render(<LoginForm />);

    await fillRegisterAndSubmit();

    expect(await screen.findByLabelText(/código enviado ao e-mail/i)).toBeInTheDocument();
    expect(requestRegisterCodeAction).toHaveBeenCalledWith("ana@example.com");
    expect(registerAction).not.toHaveBeenCalled();
    // O e-mail trava: o código foi para ESTE endereço.
    expect(screen.getByLabelText(/^e-mail$/i)).toHaveAttribute("readonly");
    expect(
      screen.getAllByRole("button", { name: /^criar conta$/i }).some((b) => (b as HTMLButtonElement).type === "submit"),
    ).toBe(true);
  });

  it("etapa 2: com o código de 6 dígitos cria a conta enviando o código", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: true, required: true });
    registerAction.mockResolvedValue({ redirectTo: "/descobrir" });
    render(<LoginForm />);
    await fillRegisterAndSubmit();

    await userEvent.type(await screen.findByLabelText(/código enviado ao e-mail/i), "042913");
    const submit = screen.getAllByRole("button", { name: /^criar conta$/i }).find((b) => (b as HTMLButtonElement).type === "submit")!;
    await userEvent.click(submit);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/descobrir"));
    expect(registerAction.mock.calls[0][0]).toMatchObject({ email: "ana@example.com", emailCode: "042913" });
  });

  it("código incompleto não chama o backend", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: true, required: true });
    render(<LoginForm />);
    await fillRegisterAndSubmit();

    await userEvent.type(await screen.findByLabelText(/código enviado ao e-mail/i), "04291");
    const submit = screen.getAllByRole("button", { name: /^criar conta$/i }).find((b) => (b as HTMLButtonElement).type === "submit")!;
    await userEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(/6 dígitos/i);
    expect(registerAction).not.toHaveBeenCalled();
  });

  it("sistema sem e-mail configurado (required: false): cadastra direto, sem etapa de código", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: true, required: false });
    registerAction.mockResolvedValue({ redirectTo: "/descobrir" });
    render(<LoginForm />);

    await fillRegisterAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/descobrir"));
    expect(registerAction.mock.calls[0][0]).not.toHaveProperty("emailCode");
    expect(screen.queryByLabelText(/código enviado ao e-mail/i)).not.toBeInTheDocument();
  });

  it("falha ao pedir o código: mostra o erro e continua na etapa 1", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: false, error: "Muitos pedidos de código." });
    render(<LoginForm />);

    await fillRegisterAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/muitos pedidos/i);
    expect(screen.queryByLabelText(/código enviado ao e-mail/i)).not.toBeInTheDocument();
  });

  it("'Alterar e-mail' volta à etapa 1 com o campo editável; 'Reenviar código' pede outro", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: true, required: true });
    render(<LoginForm />);
    await fillRegisterAndSubmit();

    await userEvent.click(await screen.findByRole("button", { name: /reenviar código/i }));
    await waitFor(() => expect(requestRegisterCodeAction).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: /alterar e-mail/i }));
    expect(screen.queryByLabelText(/código enviado ao e-mail/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^e-mail$/i)).not.toHaveAttribute("readonly");
  });

  it("erro do backend no cadastro (código errado/vencido) aparece e a tela segue na etapa do código", async () => {
    requestRegisterCodeAction.mockResolvedValue({ ok: true, required: true });
    registerAction.mockResolvedValue({ error: "Código inválido ou expirado. Peça um novo código." });
    render(<LoginForm />);
    await fillRegisterAndSubmit();

    await userEvent.type(await screen.findByLabelText(/código enviado ao e-mail/i), "111111");
    const submit = screen.getAllByRole("button", { name: /^criar conta$/i }).find((b) => (b as HTMLButtonElement).type === "submit")!;
    await userEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(/inválido ou expirado/i);
    expect(screen.getByLabelText(/código enviado ao e-mail/i)).toBeInTheDocument();
  });
});

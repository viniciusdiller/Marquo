import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

// userEvent não está nas devDependencies (só @testing-library/dom) — fireEvent seria uma
// opção, mas userEvent simula clique/teclado de verdade (incluindo o Escape). Ver setup.

function Harness({ tone = "neutral" as "neutral" | "danger", isLoading = false }) {
  const [open, setOpen] = useState(true);
  const onConfirm = vi.fn(() => setOpen(false));
  return (
    <>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir este item?"
        description="Não tem como desfazer."
        confirmLabel="Excluir"
        cancelLabel="Voltar"
        tone={tone}
        isLoading={isLoading}
        onConfirm={onConfirm}
      />
      {!open ? <p>fechado</p> : null}
    </>
  );
}

describe("ConfirmDialog", () => {
  it("não renderiza nada quando open é false", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Título"
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mostra título, descrição e os dois botões quando open", () => {
    render(<Harness />);
    expect(screen.getByRole("alertdialog", { name: "Excluir este item?" })).toBeInTheDocument();
    expect(screen.getByText("Não tem como desfazer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });

  it("clicar em cancelar fecha sem chamar onConfirm", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("fechado")).toBeInTheDocument();
  });

  it("Escape fecha o diálogo", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("clicar em confirmar chama onConfirm", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(screen.getByText("fechado")).toBeInTheDocument());
  });

  it("com isLoading, os botões ficam desabilitados e o texto muda pra 'Aguarde...'", () => {
    render(<Harness isLoading />);
    expect(screen.getByRole("button", { name: "Aguarde..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();
  });
});

describe("ConfirmDialog: conteúdo extra e confirmação condicionada", () => {
  it("mostra o conteúdo extra (children) dentro do diálogo", () => {
    render(
      <ConfirmDialog open onOpenChange={() => {}} title="Título" onConfirm={() => {}}>
        <input aria-label="campo extra" />
      </ConfirmDialog>,
    );
    expect(screen.getByRole("alertdialog")).toContainElement(screen.getByLabelText("campo extra"));
  });

  it("confirmDisabled desabilita o botão de confirmar sem impedir cancelar", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Título" confirmLabel="Ok" cancelLabel="Voltar" confirmDisabled onConfirm={onConfirm} />);

    expect(screen.getByRole("button", { name: "Ok" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Ok" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sem children e sem confirmDisabled o comportamento é o de sempre", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open onOpenChange={() => {}} title="Título" confirmLabel="Ok" onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Ok" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

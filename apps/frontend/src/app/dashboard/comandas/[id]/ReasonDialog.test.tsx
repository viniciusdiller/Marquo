import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ReasonDialog } from "./ReasonDialog";

function Harness({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <ReasonDialog open={open} onOpenChange={setOpen} title="Reabrir?" description="desc" confirmLabel="Confirmar agora" onConfirm={onConfirm} />
    </>
  );
}

const confirmButton = () => screen.getByRole("button", { name: "Confirmar agora" });

describe("ReasonDialog", () => {
  it("o botão de confirmar só habilita com um motivo que o backend aceitaria (3 a 200, sem só espaços)", async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByText("abrir"));
    expect(confirmButton()).toBeDisabled();

    await user.type(screen.getByLabelText(/Motivo/), "ab");
    expect(confirmButton()).toBeDisabled();
    await user.clear(screen.getByLabelText(/Motivo/));
    await user.type(screen.getByLabelText(/Motivo/), "     ");
    expect(confirmButton()).toBeDisabled();
    await user.type(screen.getByLabelText(/Motivo/), "valor errado");
    expect(confirmButton()).toBeEnabled();
  });

  it("confirma com o motivo aparado", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByText("abrir"));
    await user.type(screen.getByLabelText(/Motivo/), "  digitei errado  ");
    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledWith("digitei errado");
  });

  it("limita o motivo a 200 caracteres no próprio campo", async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByText("abrir"));
    expect(screen.getByLabelText(/Motivo/)).toHaveAttribute("maxlength", "200");
  });

  it("cada vez que abre, o campo começa vazio (não vaza o motivo da vez anterior)", async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={vi.fn()} />);
    await user.click(screen.getByText("abrir"));
    await user.type(screen.getByLabelText(/Motivo/), "primeiro motivo");
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    await user.click(screen.getByText("abrir"));
    expect(screen.getByLabelText(/Motivo/)).toHaveValue("");
    expect(confirmButton()).toBeDisabled();
  });
});

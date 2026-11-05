import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldHelp } from "./FieldHelp";

describe("FieldHelp", () => {
  it("renderiza o botão com atributos acessíveis", () => {
    render(<FieldHelp title="Duração">Tempo do serviço</FieldHelp>);
    const button = screen.getByRole("button", { name: /ajuda sobre duração/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("abre a dica ao clicar e fecha ao clicar novamente", async () => {
    const user = userEvent.setup();
    render(<FieldHelp title="Duração">Tempo do serviço</FieldHelp>);

    const button = screen.getByRole("button", { name: /ajuda sobre duração/i });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Tempo do serviço")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");

    await user.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("fecha o tooltip ao pressionar a tecla Escape", async () => {
    const user = userEvent.setup();
    render(<FieldHelp title="Preço">Valor em reais</FieldHelp>);

    const button = screen.getByRole("button", { name: /ajuda sobre preço/i });
    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});


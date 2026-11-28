import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlatformUserRow } from "@/lib/platform-api";
import { OwnersTable } from "./OwnersTable";

const owner: PlatformUserRow = {
  id: "dono-1",
  name: "Brenno del bianco",
  email: "dono@x.com",
  role: "OWNER",
  isActive: true,
  createdAt: "2026-11-03T21:18:00.000Z",
  tenant: { id: "t-1", name: "Del bianco barbearia", slug: "del-bianco" },
  team: [{ id: "u-2", name: "Brenno Del Bianco", email: "prof@x.com", role: "PROFESSIONAL", isActive: true, createdAt: "2026-11-03T21:31:00.000Z" }],
  teamTotal: 1,
};

describe("OwnersTable", () => {
  it("mostra só o dono; a setinha abre e fecha a equipe do negócio", async () => {
    render(<OwnersTable owners={[owner]} />);
    expect(screen.getByText("Brenno del bianco")).toBeInTheDocument();
    expect(screen.queryByText("prof@x.com")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /abrir equipe de del bianco barbearia/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("prof@x.com")).toBeInTheDocument();
    expect(screen.getByText("Profissional")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /fechar equipe/i }));
    expect(screen.queryByText("prof@x.com")).not.toBeInTheDocument();
  });

  it("negócio só com o dono avisa ao abrir; equipe maior que o teto leva ao detalhe", async () => {
    render(<OwnersTable owners={[{ ...owner, id: "a", team: [], teamTotal: 0 }, { ...owner, id: "b", teamTotal: 80 }]} />);
    expect(screen.getByText("Só o dono")).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("button", { name: /abrir equipe/i });
    await userEvent.click(first);
    expect(screen.getByText(/nenhuma outra pessoa/i)).toBeInTheDocument();
    await userEvent.click(second);
    expect(screen.getByText(/mostrando 1 de 80/i)).toBeInTheDocument();
  });

  it("lista vazia", () => {
    render(<OwnersTable owners={[]} />);
    expect(screen.getByText("Nenhum dono encontrado.")).toBeInTheDocument();
  });
});

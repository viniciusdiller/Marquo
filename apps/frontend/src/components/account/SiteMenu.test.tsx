import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/descobrir" }));
const toggleTheme = vi.fn();
let mockTheme: "light" | "dark" = "light";
vi.mock("../ThemeProvider", () => ({ useTheme: () => ({ theme: mockTheme, toggleTheme }) }));

import { SiteMenu } from "./SiteMenu";

describe("SiteMenu (hambúrguer do celular)", () => {
  it("começa fechado e abre com o botão (aria-expanded)", async () => {
    render(<SiteMenu />);
    const button = screen.getByRole("button", { name: "Abrir menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /estabelecimentos/i })).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /estabelecimentos/i })).toHaveAttribute("href", "/descobrir");
  });

  it("troca o tema pelo menu, oferecendo a opção oposta ao tema atual", async () => {
    mockTheme = "light";
    toggleTheme.mockReset();
    const { unmount } = render(<SiteMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Tema escuro" }));
    expect(toggleTheme).toHaveBeenCalledTimes(1);
    unmount();

    mockTheme = "dark";
    render(<SiteMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.getByRole("button", { name: "Tema claro" })).toBeInTheDocument();
  });

  it("fecha com Esc e ao clicar fora", async () => {
    render(<SiteMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: /estabelecimentos/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("link", { name: /estabelecimentos/i })).not.toBeInTheDocument();
  });
});

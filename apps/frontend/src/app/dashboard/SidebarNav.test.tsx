import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarNav } from "./SidebarNav";

let mockPathname = "/dashboard/agenda";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("SidebarNav", () => {
  it("marca só o link da rota atual como ativo", () => {
    mockPathname = "/dashboard/agenda";
    render(<SidebarNav />);
    const agenda = screen.getByRole("link", { name: /agenda/i });
    const comandas = screen.getByRole("link", { name: /comandas/i });
    expect(agenda).toHaveAttribute("href", "/dashboard/agenda");
    expect(agenda).toHaveAttribute("aria-current", "page");
    expect(comandas).toHaveAttribute("href", "/dashboard/comandas");
    expect(comandas).not.toHaveAttribute("aria-current");
  });

  it("mantém a categoria destacada quando em subrotas filhas", () => {
    mockPathname = "/dashboard/comandas/d2cfe5e8-2e55-460b-b3f3-cf9a6975b97b";
    render(<SidebarNav />);
    const agenda = screen.getByRole("link", { name: /agenda/i });
    const comandas = screen.getByRole("link", { name: /comandas/i });
    expect(comandas).toHaveAttribute("aria-current", "page");
    expect(agenda).not.toHaveAttribute("aria-current");
  });

  it("cada item tem um title explicando pra que serve", () => {
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /comissões/i })).toHaveAttribute(
      "title",
      expect.stringContaining("comissão"),
    );
    expect(screen.getByRole("link", { name: /marketplace/i })).toHaveAttribute(
      "title",
      expect.stringContaining("clientes"),
    );
  });

  // Regressão: duas instâncias (desktop + drawer mobile) compartilhavam o mesmo layoutId
  // da pill ativa e isso travava a animação das duas (ver MobileSidebar.tsx). Montar duas ao
  // mesmo tempo não deve quebrar a renderização.
  it("duas instâncias com scope diferente montam juntas sem erro", () => {
    render(
      <>
        <SidebarNav scope="desktop" />
        <SidebarNav scope="mobile" />
      </>,
    );
    const agendaLinks = screen.getAllByRole("link", { name: /agenda/i });
    expect(agendaLinks).toHaveLength(2);
  });

  it("onNavigate é chamado ao clicar num link (fecha o drawer mobile)", async () => {
    const onNavigate = vi.fn();
    render(<SidebarNav onNavigate={onNavigate} />);
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.setup().click(screen.getByRole("link", { name: /comandas/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { normalizePermissions } from "@marquo/shared-types";
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

describe("SidebarNav com perfil de acesso", () => {
  const perms = (p: Record<string, string>) => normalizePermissions(p);

  it("perfil de caixa só vê as telas liberadas e nenhuma área do dono", () => {
    render(<SidebarNav access={{ isOwner: false, permissions: perms({ caixa: "EDIT", comandas: "VIEW" }) }} />);
    expect(screen.getByRole("link", { name: /caixa/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /comandas/i })).toBeInTheDocument();
    for (const name of [/agenda/i, /financeiro/i, /plano e cobrança/i, /configurações/i, /perfis e acessos/i]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("seções sem nenhum item liberado somem", () => {
    render(<SidebarNav access={{ isOwner: false, permissions: perms({ caixa: "VIEW" }) }} />);
    expect(screen.queryByText("Catálogo")).not.toBeInTheDocument();
    expect(screen.getByText("Operação do dia")).toBeInTheDocument();
  });

  it("dono vê tudo, inclusive Perfis e acessos", () => {
    render(<SidebarNav access={{ isOwner: true, permissions: perms({}) }} />);
    expect(screen.getByRole("link", { name: /perfis e acessos/i })).toHaveAttribute("href", "/dashboard/acessos");
    expect(screen.getByRole("link", { name: /plano e cobrança/i })).toBeInTheDocument();
  });
});

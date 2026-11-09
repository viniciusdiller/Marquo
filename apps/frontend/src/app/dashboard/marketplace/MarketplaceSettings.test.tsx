import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MarketplaceSettings as Settings } from "@marquo/shared-types";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  saveMarketplaceAction: vi.fn(),
  lookupCepAction: vi.fn(),
  reverseGeocodeAction: vi.fn(),
  geocodeAddressAction: vi.fn(),
}));

import { MarketplaceSettings } from "./MarketplaceSettings";

const mockSettings: Settings = {
  listedInMarketplace: false,
  address: "Rua Augusta, 100",
  city: "São Paulo",
  neighborhood: "Consolação",
  latitude: -23.55,
  longitude: -46.65,
  priceRange: 2,
  categorySlugs: ["barbearia"],
  availableCategories: [
    { id: "1", slug: "barbearia", name: "Barbearia", position: 0 },
    { id: "2", slug: "salao", name: "Salão de beleza", position: 1 },
  ],
};

describe("MarketplaceSettings", () => {
  it("renderiza o card de visibilidade com estado inativo por padrão", () => {
    render(<MarketplaceSettings settings={mockSettings} />);

    expect(screen.getByText("Visibilidade na busca pública do Marquo")).toBeInTheDocument();
    expect(screen.getByText("Apenas com link direto")).toBeInTheDocument();
    expect(
      screen.getByText(/Apenas quem já possui o seu link direto.*consegue marcar horário/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/100% gratuito: sem comissões por agendamento/i),
    ).toBeInTheDocument();
  });

  it("renderiza o estado ativo com badge de visibilidade pública quando listedInMarketplace é true", () => {
    render(<MarketplaceSettings settings={{ ...mockSettings, listedInMarketplace: true }} />);

    expect(screen.getByText("Visível para novos clientes")).toBeInTheDocument();
    expect(
      screen.getByText(/Seu negócio aparece para pessoas procurando barbearias e salões na sua região/i),
    ).toBeInTheDocument();
  });

  it("permite alternar a visibilidade no switch e atualiza os textos em tempo real", async () => {
    const user = userEvent.setup();
    render(<MarketplaceSettings settings={mockSettings} />);

    const switchInput = screen.getByRole("checkbox", { name: /ativar visibilidade na busca pública/i });
    expect(switchInput).not.toBeChecked();

    await user.click(switchInput);
    expect(switchInput).toBeChecked();
    expect(screen.getByText("Visível para novos clientes")).toBeInTheDocument();

    await user.click(switchInput);
    expect(switchInput).not.toBeChecked();
    expect(screen.getByText("Apenas com link direto")).toBeInTheDocument();
  });

  it("apresenta o link externo para a página pública de busca", () => {
    render(<MarketplaceSettings settings={mockSettings} />);

    const searchLink = screen.getByRole("link", { name: /ver página de busca/i });
    expect(searchLink).toHaveAttribute("href", "/descobrir");
    expect(searchLink).toHaveAttribute("target", "_blank");
  });
});

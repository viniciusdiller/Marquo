import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MarketplaceSettings as Settings } from "@marquo/shared-types";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  saveMarketplaceAction: vi.fn(),
  toggleMarketplaceListingAction: vi.fn(),
  lookupCepAction: vi.fn(),
  reverseGeocodeAction: vi.fn(),
  geocodeAddressAction: vi.fn(),
}));

import { MarketplaceSettings } from "./MarketplaceSettings";
import { toggleMarketplaceListingAction } from "./actions";

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toggleMarketplaceListingAction).mockResolvedValue({ ok: true });
  });

  it("renderiza o card de visibilidade com estado inativo por padrão e sem texto de taxa", () => {
    render(<MarketplaceSettings settings={mockSettings} />);

    expect(screen.getByText("Visibilidade na busca pública do Marquo")).toBeInTheDocument();
    expect(screen.getByText("Apenas com link direto")).toBeInTheDocument();
    expect(
      screen.getByText(/Apenas quem já possui o seu link direto.*consegue marcar horário/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/100% gratuito/i)).not.toBeInTheDocument();
  });

  it("renderiza o estado ativo com badge de visibilidade pública quando listedInMarketplace é true", () => {
    render(<MarketplaceSettings settings={{ ...mockSettings, listedInMarketplace: true }} />);

    expect(screen.getByText("Visível para novos clientes")).toBeInTheDocument();
    expect(
      screen.getByText(/Seu negócio aparece para pessoas procurando barbearias e salões na sua região/i),
    ).toBeInTheDocument();
  });

  it("salva automaticamente ao clicar no switch e chama a action", async () => {
    const user = userEvent.setup();
    render(<MarketplaceSettings settings={mockSettings} />);

    const switchInput = screen.getByRole("checkbox", { name: /ativar visibilidade na busca pública/i });
    expect(switchInput).not.toBeChecked();

    await user.click(switchInput);
    expect(switchInput).toBeChecked();
    expect(toggleMarketplaceListingAction).toHaveBeenCalledWith(true);
    expect(screen.getByText("Visível para novos clientes")).toBeInTheDocument();
  });

  it("reverte o switch e mostra o erro se a action falhar (ex: falta cidade ou categoria)", async () => {
    vi.mocked(toggleMarketplaceListingAction).mockResolvedValue({
      error: "Para aparecer no marketplace, informe a cidade e ao menos uma categoria.",
    });

    const user = userEvent.setup();
    render(<MarketplaceSettings settings={mockSettings} />);

    const switchInput = screen.getByRole("checkbox", { name: /ativar visibilidade na busca pública/i });
    await user.click(switchInput);

    expect(toggleMarketplaceListingAction).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText("Para aparecer no marketplace, informe a cidade e ao menos uma categoria."),
    ).toBeInTheDocument();
    expect(switchInput).not.toBeChecked();
  });

  it("apresenta apenas o link externo para a página pública de busca", () => {
    render(<MarketplaceSettings settings={mockSettings} />);

    const searchLink = screen.getByRole("link", { name: /ver página de busca/i });
    expect(searchLink).toHaveAttribute("href", "/descobrir");
    expect(searchLink).toHaveAttribute("target", "_blank");
  });
});

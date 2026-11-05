import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddressLocationPicker } from "./AddressLocationPicker";
import * as actions from "@/app/dashboard/marketplace/actions";

vi.mock("@/app/dashboard/marketplace/actions", () => ({
  lookupCepAction: vi.fn(),
  reverseGeocodeAction: vi.fn(),
  geocodeAddressAction: vi.fn(),
}));

vi.mock("./InteractiveLocationMap", () => ({
  InteractiveLocationMap: ({
    latitude,
    longitude,
    onPositionChange,
  }: {
    latitude: number | null;
    longitude: number | null;
    onPositionChange: (lat: number, lng: number) => void;
  }) => (
    <div data-testid="interactive-map">
      <span>Lat: {latitude}</span>
      <span>Lng: {longitude}</span>
      <button
        type="button"
        onClick={() => onPositionChange(-23.55052, -46.633308)}
      >
        Mover Pin no Mapa
      </button>
    </div>
  ),
}));

describe("AddressLocationPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza os campos com valores iniciais", () => {
    render(
      <AddressLocationPicker
        initialAddress="Rua das Palmeiras, 100"
        initialCity="São Paulo"
        initialNeighborhood="Pinheiros"
        initialLatitude={-23.56}
        initialLongitude={-46.68}
      />,
    );

    expect(screen.getByLabelText(/rua \/ logradouro/i)).toHaveValue("Rua das Palmeiras");
    expect(screen.getByLabelText(/número da fachada/i)).toHaveValue("100");
    expect(screen.getByLabelText(/cidade/i)).toHaveValue("São Paulo");
    expect(screen.getByLabelText(/bairro/i)).toHaveValue("Pinheiros");
    expect(screen.getByLabelText(/^latitude$/i)).toHaveValue("-23.56");
    expect(screen.getByLabelText(/^longitude$/i)).toHaveValue("-46.68");
  });

  it("abre e fecha o tutorial do Google Maps", async () => {
    const user = userEvent.setup();
    render(<AddressLocationPicker />);

    const tutorialBtn = screen.getByRole("button", { name: /como pegar no google maps/i });
    expect(screen.queryByText(/tutorial rápido/i)).not.toBeInTheDocument();

    await user.click(tutorialBtn);
    expect(screen.getByText(/tutorial rápido/i)).toBeInTheDocument();
    expect(screen.getByText(/clique com o/i)).toBeInTheDocument();

    await user.click(tutorialBtn);
    expect(screen.queryByText(/tutorial rápido/i)).not.toBeInTheDocument();
  });

  it("busca CEP e preenche endereço e coordenadas automaticamente", async () => {
    vi.mocked(actions.lookupCepAction).mockResolvedValue({
      ok: true,
      street: "Avenida Paulista",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      latitude: -23.561,
      longitude: -46.656,
    });

    const user = userEvent.setup();
    render(<AddressLocationPicker />);

    const cepInput = screen.getByPlaceholderText("00000-000");
    await user.type(cepInput, "01310100");

    await waitFor(() => {
      expect(actions.lookupCepAction).toHaveBeenCalledWith("01310100");
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/rua \/ logradouro/i)).toHaveValue("Avenida Paulista");
      expect(screen.getByLabelText(/bairro/i)).toHaveValue("Bela Vista");
      expect(screen.getByLabelText(/cidade/i)).toHaveValue("São Paulo");
      expect(screen.getByLabelText(/^latitude$/i)).toHaveValue("-23.561");
      expect(screen.getByLabelText(/^longitude$/i)).toHaveValue("-46.656");
    });
  });

  it("usa GPS atual e preenche endereço completo via geocodificação reversa", async () => {
    vi.mocked(actions.reverseGeocodeAction).mockResolvedValue({
      ok: true,
      street: "Rua Augusta",
      number: "500",
      neighborhood: "Consolação",
      city: "São Paulo",
      cep: "01304-000",
      latitude: -23.551,
      longitude: -46.652,
    });

    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: -23.551,
            longitude: -46.652,
          },
        });
      }),
    };
    Object.defineProperty(global.navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
      writable: true,
    });

    const user = userEvent.setup();
    render(<AddressLocationPicker />);

    const gpsBtn = screen.getByRole("button", { name: /usar meu gps atual/i });
    await user.click(gpsBtn);

    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();

    await waitFor(() => {
      expect(actions.reverseGeocodeAction).toHaveBeenCalledWith(-23.551, -46.652);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/rua \/ logradouro/i)).toHaveValue("Rua Augusta");
      expect(screen.getByLabelText(/número da fachada/i)).toHaveValue("500");
      expect(screen.getByLabelText(/bairro/i)).toHaveValue("Consolação");
      expect(screen.getByLabelText(/cidade/i)).toHaveValue("São Paulo");
      expect(screen.getByLabelText(/^latitude$/i)).toHaveValue("-23.551");
      expect(screen.getByLabelText(/^longitude$/i)).toHaveValue("-46.652");
    });
  });

  it("permite ajustar o marcador diretamente no mapa interativo", async () => {
    const user = userEvent.setup();
    render(<AddressLocationPicker />);

    const movePinBtn = screen.getByRole("button", { name: /mover pin no mapa/i });
    await user.click(movePinBtn);

    expect(screen.getByLabelText(/^latitude$/i)).toHaveValue("-23.55052");
    expect(screen.getByLabelText(/^longitude$/i)).toHaveValue("-46.633308");
    expect(screen.getByText(/marcador reposicionado no mapa/i)).toBeInTheDocument();
  });

  it("trata recusa de permissão de GPS com aviso amigável", async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((_success, error) => {
        error({ code: 1, PERMISSION_DENIED: 1 });
      }),
    };
    Object.defineProperty(global.navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
      writable: true,
    });

    const user = userEvent.setup();
    render(<AddressLocationPicker />);

    const gpsBtn = screen.getByRole("button", { name: /usar meu gps atual/i });
    await user.click(gpsBtn);

    await waitFor(() => {
      expect(screen.getByText(/permissão de gps negada/i)).toBeInTheDocument();
    });
  });
});

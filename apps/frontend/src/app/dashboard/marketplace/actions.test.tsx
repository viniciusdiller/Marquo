import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-server", () => ({ authedFetch: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import {
  lookupCepAction,
  reverseGeocodeAction,
  geocodeAddressAction,
  toggleMarketplaceListingAction,
} from "./actions";

describe("Marketplace Geolocation Actions", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("lookupCepAction", () => {
    it("recusa CEP que não tem 8 dígitos", async () => {
      const res = await lookupCepAction("123");
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/8 dígitos/i);
    });

    it("busca com sucesso via BrasilAPI v2 com coordenadas oficiais", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("brasilapi.com.br/api/cep/v2/")) {
          return {
            ok: true,
            json: async () => ({
              street: "Avenida Paulista",
              neighborhood: "Bela Vista",
              city: "São Paulo",
              state: "SP",
              location: {
                coordinates: {
                  latitude: "-23.561500",
                  longitude: "-46.655900",
                },
              },
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      const res = await lookupCepAction("01310-100");

      expect(res.ok).toBe(true);
      expect(res.street).toBe("Avenida Paulista");
      expect(res.neighborhood).toBe("Bela Vista");
      expect(res.city).toBe("São Paulo");
      expect(res.latitude).toBe(-23.5615);
      expect(res.longitude).toBe(-46.6559);
    });

    it("faz fallback para ViaCEP quando BrasilAPI falha", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("brasilapi.com.br")) {
          return { ok: false } as Response;
        }
        if (url.includes("viacep.com.br")) {
          return {
            ok: true,
            json: async () => ({
              logradouro: "Rua das Flores",
              bairro: "Centro",
              localidade: "Curitiba",
              uf: "PR",
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      const res = await lookupCepAction("80000000");

      expect(res.ok).toBe(true);
      expect(res.street).toBe("Rua das Flores");
      expect(res.neighborhood).toBe("Centro");
      expect(res.city).toBe("Curitiba");
    });
  });

  describe("geocodeAddressAction", () => {
    it("busca localização exata com número e rua", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: "-23.561770",
            lon: "-46.655330",
            display_name: "Avenida Paulista, 1500, São Paulo, Brasil",
          },
        ],
      } as Response);

      const res = await geocodeAddressAction({
        street: "Avenida Paulista",
        number: "1500",
        city: "São Paulo",
        state: "SP",
      });

      expect(res.ok).toBe(true);
      expect(res.latitude).toBe(-23.56177);
      expect(res.longitude).toBe(-46.65533);
    });
  });

  describe("reverseGeocodeAction", () => {
    it("recusa latitude ou longitude inválida", async () => {
      const res1 = await reverseGeocodeAction(999, 10);
      expect(res1.ok).toBe(false);

      const res2 = await reverseGeocodeAction(10, -250);
      expect(res2.ok).toBe(false);
    });

    it("identifica endereço completo com número pelo GPS via Nominatim", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          address: {
            road: "Avenida Paulista",
            house_number: "1578",
            suburb: "Bela Vista",
            city: "São Paulo",
            state: "São Paulo",
            postcode: "01310-200",
          },
        }),
      } as Response);

      const res = await reverseGeocodeAction(-23.5615, -46.6559);

      expect(res.ok).toBe(true);
      expect(res.street).toBe("Avenida Paulista");
      expect(res.number).toBe("1578");
      expect(res.neighborhood).toBe("Bela Vista");
      expect(res.city).toBe("São Paulo");
      expect(res.cep).toBe("01310-200");
      expect(res.latitude).toBe(-23.5615);
      expect(res.longitude).toBe(-46.6559);
    });
  });

  describe("toggleMarketplaceListingAction", () => {
    it("chama PATCH /tenants/me/marketplace com listedInMarketplace true", async () => {
      vi.mocked(authedFetch).mockResolvedValueOnce({ slug: "barbearia-teste" });

      const res = await toggleMarketplaceListingAction(true);

      expect(res.ok).toBe(true);
      expect(authedFetch).toHaveBeenCalledWith("/tenants/me/marketplace", {
        method: "PATCH",
        body: JSON.stringify({ listedInMarketplace: true }),
      });
    });

    it("chama PATCH /tenants/me/marketplace com listedInMarketplace false", async () => {
      vi.mocked(authedFetch).mockResolvedValueOnce({ slug: "barbearia-teste" });

      const res = await toggleMarketplaceListingAction(false);

      expect(res.ok).toBe(true);
      expect(authedFetch).toHaveBeenCalledWith("/tenants/me/marketplace", {
        method: "PATCH",
        body: JSON.stringify({ listedInMarketplace: false }),
      });
    });

    it("retorna o erro formatado caso a API recuse a listagem", async () => {
      vi.mocked(authedFetch).mockRejectedValueOnce(
        new ApiError("Para aparecer no marketplace, informe a cidade e ao menos uma categoria.", 400),
      );

      const res = await toggleMarketplaceListingAction(true);

      expect(res.ok).toBeUndefined();
      expect(res.error).toBe("Para aparecer no marketplace, informe a cidade e ao menos uma categoria.");
    });
  });
});

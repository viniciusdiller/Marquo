import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-server", () => ({ authedFetch: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { lookupCepAction, reverseGeocodeAction } from "./actions";

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

    it("busca com sucesso via ViaCEP e geocodifica coordenadas", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("viacep.com.br")) {
          return {
            ok: true,
            json: async () => ({
              logradouro: "Praça da Sé",
              bairro: "Sé",
              localidade: "São Paulo",
              uf: "SP",
            }),
          } as Response;
        }
        if (url.includes("nominatim.openstreetmap.org")) {
          return {
            ok: true,
            json: async () => [
              {
                lat: "-23.550520",
                lon: "-46.633308",
              },
            ],
          } as Response;
        }
        return { ok: false } as Response;
      });

      const res = await lookupCepAction("01001-000");

      expect(res.ok).toBe(true);
      expect(res.street).toBe("Praça da Sé");
      expect(res.neighborhood).toBe("Sé");
      expect(res.city).toBe("São Paulo");
      expect(res.latitude).toBe(-23.55052);
      expect(res.longitude).toBe(-46.633308);
    });

    it("faz fallback para BrasilAPI quando ViaCEP falha", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("viacep.com.br")) {
          return {
            ok: true,
            json: async () => ({ erro: true }),
          } as Response;
        }
        if (url.includes("brasilapi.com.br")) {
          return {
            ok: true,
            json: async () => ({
              street: "Rua das Flores",
              neighborhood: "Centro",
              city: "Curitiba",
              state: "PR",
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

  describe("reverseGeocodeAction", () => {
    it("recusa latitude ou longitude inválida", async () => {
      const res1 = await reverseGeocodeAction(999, 10);
      expect(res1.ok).toBe(false);

      const res2 = await reverseGeocodeAction(10, -250);
      expect(res2.ok).toBe(false);
    });

    it("identifica endereço completo pelo GPS via Nominatim", async () => {
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
      expect(res.street).toBe("Avenida Paulista, 1578");
      expect(res.neighborhood).toBe("Bela Vista");
      expect(res.city).toBe("São Paulo");
      expect(res.cep).toBe("01310-200");
      expect(res.latitude).toBe(-23.5615);
      expect(res.longitude).toBe(-46.6559);
    });
  });
});

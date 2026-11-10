import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-server", () => ({ authedFetch: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { lookupCepAction, reverseGeocodeAction, geocodeAddressAction } from "./actions";

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

    // Regressão: a BrasilAPI manda a mesma coordenada (o centro da cidade) para TODOS os CEPs de uma cidade. Usá-la fazia a
    // busca por CEP cair sempre no mesmo lugar. O ponto vem do geocodificador, pela rua.
    const CITY_CENTER = { latitude: "-22.89889", longitude: "-42.46985" };

    function mockServices(opts: { street: string; neighborhood: string; nominatim: (url: string) => unknown[] }) {
      const nominatimUrls: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("brasilapi.com.br/api/cep/v2/")) {
          return {
            ok: true,
            json: async () => ({
              street: opts.street,
              neighborhood: opts.neighborhood,
              city: "Saquarema",
              state: "RJ",
              location: { coordinates: CITY_CENTER },
            }),
          } as Response;
        }
        if (url.includes("nominatim.openstreetmap.org/search")) {
          nominatimUrls.push(url);
          return { ok: true, json: async () => opts.nominatim(url) } as Response;
        }
        return { ok: false } as Response;
      });
      return nominatimUrls;
    }

    it("ignora a coordenada da BrasilAPI (centro da cidade) e localiza pela rua", async () => {
      mockServices({
        street: "Rua Capitão Nunes",
        neighborhood: "Barreira (Bacaxá)",
        nominatim: () => [{ lat: "-22.890500", lon: "-42.493330" }],
      });

      const res = await lookupCepAction("28994-500");

      expect(res.ok).toBe(true);
      expect(res.street).toBe("Rua Capitão Nunes");
      expect(res.city).toBe("Saquarema");
      expect(res.latitude).toBe(-22.8905);
      expect(res.longitude).toBe(-42.49333);
      expect(res.precision).toBe("street");
      // Nunca o ponto do centro da cidade.
      expect(res.latitude).not.toBe(Number(CITY_CENTER.latitude));
    });

    it("dois CEPs da mesma cidade dão pontos diferentes", async () => {
      const points: Record<string, { lat: string; lon: string }> = {
        "Rua A": { lat: "-22.9", lon: "-42.4" },
        "Rua B": { lat: "-22.8", lon: "-42.5" },
      };
      mockServices({
        street: "Rua A",
        neighborhood: "Centro",
        nominatim: (url) => [points[decodeURIComponent(url.match(/street=([^&]+)/)![1])]],
      });
      const first = await lookupCepAction("28990-100");
      mockServices({
        street: "Rua B",
        neighborhood: "Centro",
        nominatim: (url) => [points[decodeURIComponent(url.match(/street=([^&]+)/)![1])]],
      });
      const second = await lookupCepAction("28990-200");

      expect(first.latitude).not.toBe(second.latitude);
      expect(first.longitude).not.toBe(second.longitude);
    });

    it("rua desconhecida no mapa: cai para o bairro (aproximado), tentando o nome entre parênteses", async () => {
      const urls = mockServices({
        street: "Rua Jaime Warde Carvalho",
        neighborhood: "Porto da Roça II (Bacaxá)",
        nominatim: (url) => (url.includes("street=") ? [] : decodeURIComponent(url).includes("q=Bacaxá,") ? [{ lat: "-22.8939", lon: "-42.4663" }] : []),
      });

      const res = await lookupCepAction("28994-366");

      expect(res.ok).toBe(true);
      expect(res.latitude).toBe(-22.8939);
      expect(res.longitude).toBe(-42.4663);
      expect(res.precision).toBe("neighborhood");
      expect(urls.some((u) => u.includes("street="))).toBe(true);
    });

    it("sem rua nem bairro no mapa: devolve o endereço sem coordenada (não inventa ponto)", async () => {
      mockServices({ street: "Rua X", neighborhood: "Bairro Y", nominatim: () => [] });

      const res = await lookupCepAction("28990-300");

      expect(res.ok).toBe(true);
      expect(res.city).toBe("Saquarema");
      expect(res.latitude).toBeNull();
      expect(res.longitude).toBeNull();
      expect(res.precision).toBeUndefined();
    });

    it("geocodificador fora do ar: o endereço continua preenchido, sem coordenada", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("brasilapi.com.br")) {
          return { ok: true, json: async () => ({ street: "Rua X", neighborhood: "Centro", city: "Saquarema", state: "RJ", location: { coordinates: CITY_CENTER } }) } as Response;
        }
        throw new Error("rede");
      });

      const res = await lookupCepAction("28990-400");

      expect(res.ok).toBe(true);
      expect(res.latitude).toBeNull();
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
});

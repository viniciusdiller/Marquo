import { NotFoundException } from "@nestjs/common";
import { MarketplaceService } from "./marketplace.service";
import { PrismaService } from "../prisma/prisma.service";

function build(over: Record<string, unknown> = {}) {
  const prisma = {
    serviceCategory: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    review: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  } as unknown as PrismaService;
  return { service: new MarketplaceService(prisma), prisma };
}

const tenantRow = (over: Record<string, unknown> = {}) => ({
  id: "t-1",
  name: "Salão A",
  slug: "salao-a",
  description: null,
  city: "São Paulo",
  neighborhood: "Centro",
  priceRange: 2,
  logoUrl: null,
  latitude: -23.55,
  longitude: -46.63,
  categories: [{ category: { name: "Barbearia", slug: "barbearia" } }],
  ...over,
});

describe("MarketplaceService.listCategories", () => {
  // Regressão: listCategories devolvia todo o catálogo de ServiceCategory, sem checar se
  // algum negócio listado de fato usava a categoria — a busca mostrava chips de filtro que
  // sempre voltavam vazio.
  it("filtra só categorias com pelo menos um negócio listado", async () => {
    const { service, prisma } = build();
    await service.listCategories();

    expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenants: { some: { tenant: { listedInMarketplace: true, suspendedAt: null } } },
        },
      }),
    );
  });
});

describe("MarketplaceService.search", () => {
  it("ordena por distância quando lat/lng são passados", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      tenantRow({ id: "far", latitude: -23.7, longitude: -46.8 }),
      tenantRow({ id: "near", latitude: -23.551, longitude: -46.631 }),
    ]);

    const results = await service.search({ lat: -23.55, lng: -46.63 });

    expect(results[0].id).toBe("near");
    expect(results[0].distanceKm).toBeGreaterThanOrEqual(0);
  });

  it("sem geo, ordena por nota média", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      tenantRow({ id: "a" }),
      tenantRow({ id: "b" }),
    ]);
    (prisma.review.groupBy as jest.Mock).mockResolvedValue([
      { tenantId: "a", _avg: { rating: 3 }, _count: { _all: 2 } },
      { tenantId: "b", _avg: { rating: 4.8 }, _count: { _all: 9 } },
    ]);

    const results = await service.search({});

    expect(results[0].id).toBe("b");
    expect(results[0].rating.average).toBe(4.8);
  });

  // Regressão: a nota média simples colocava 1 avaliação 5,0 acima de 4,8 em 40 avaliações.
  it("pondera a nota pelo nº de avaliações (1 avaliação 5,0 não passa 4,8 em 40)", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      tenantRow({ id: "poucas" }),
      tenantRow({ id: "muitas" }),
    ]);
    (prisma.review.groupBy as jest.Mock).mockResolvedValue([
      { tenantId: "poucas", _avg: { rating: 5 }, _count: { _all: 1 } },
      { tenantId: "muitas", _avg: { rating: 4.8 }, _count: { _all: 40 } },
    ]);

    const results = await service.search({});

    expect(results.map((r) => r.id)).toEqual(["muitas", "poucas"]);
  });

  it("sem avaliação fica abaixo de quem tem nota alta e acima de quem tem nota baixa", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      tenantRow({ id: "baixa", name: "A" }),
      tenantRow({ id: "sem", name: "B" }),
      tenantRow({ id: "alta", name: "C" }),
    ]);
    (prisma.review.groupBy as jest.Mock).mockResolvedValue([
      { tenantId: "baixa", _avg: { rating: 2 }, _count: { _all: 10 } },
      { tenantId: "alta", _avg: { rating: 4.9 }, _count: { _all: 10 } },
    ]);

    const results = await service.search({});

    expect(results.map((r) => r.id)).toEqual(["alta", "sem", "baixa"]);
  });

  it("sort=rating com lat/lng mantém o filtro de raio mas ordena pela nota, não pela distância", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      tenantRow({ id: "perto-ruim", latitude: -23.551, longitude: -46.631 }),
      tenantRow({ id: "longe-bom", latitude: -23.6, longitude: -46.7 }),
    ]);
    (prisma.review.groupBy as jest.Mock).mockResolvedValue([
      { tenantId: "perto-ruim", _avg: { rating: 3 }, _count: { _all: 20 } },
      { tenantId: "longe-bom", _avg: { rating: 4.9 }, _count: { _all: 20 } },
    ]);

    const results = await service.search({ lat: -23.55, lng: -46.63, sort: "rating" });

    expect(results[0].id).toBe("longe-bom");
    expect(results[0].distanceKm).not.toBeNull();
    const where = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.latitude).toBeDefined();
  });

  // Regressão: `take` era aplicado no banco ANTES de ordenar, então o corte pegava negócios
  // arbitrários em vez dos melhores.
  it("aplica o limite depois de ordenar, não antes", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([
      tenantRow({ id: "a", name: "A" }),
      tenantRow({ id: "b", name: "B" }),
      tenantRow({ id: "c", name: "C" }),
    ]);
    (prisma.review.groupBy as jest.Mock).mockResolvedValue([
      { tenantId: "c", _avg: { rating: 5 }, _count: { _all: 30 } },
    ]);

    const results = await service.search({ limit: 1 });

    expect(results.map((r) => r.id)).toEqual(["c"]);
    const args = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0];
    expect(args.take).toBeGreaterThan(1);
  });

  it("aplica filtro de categoria no where", async () => {
    const { service, prisma } = build();
    await service.search({ category: "barbearia" });
    const where = (prisma.tenant.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.categories.some.category.slug).toBe("barbearia");
    expect(where.listedInMarketplace).toBe(true);
  });

  it("establishmentProfile lança NotFound se não listado", async () => {
    const { service, prisma } = build();
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.establishmentProfile("x")).rejects.toThrow(NotFoundException);
  });
});

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReviewStatus } from "@marquo/database";
import { PrismaService } from "../prisma/prisma.service";

// ~111 km por grau de latitude; usamos um bounding box grosseiro e ordenamos por distância
// aproximada (equiretangular) — suficiente para "perto de mim" sem PostGIS.
const KM_PER_DEG_LAT = 111;

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  // Só categorias com pelo menos um negócio listado — a página de descoberta usava essa
  // lista pra montar os chips de filtro, então uma categoria cadastrada no catálogo mas
  // sem nenhum negócio real usando ela virava um filtro morto (clicável, sempre vazio).
  listCategories() {
    return this.prisma.serviceCategory.findMany({
      where: { tenants: { some: { tenant: { listedInMarketplace: true } } } },
      orderBy: { position: "asc" },
    });
  }

  async search(params: {
    q?: string;
    city?: string;
    category?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    take?: number;
  }) {
    const where: Prisma.TenantWhereInput = { listedInMarketplace: true };
    if (params.city?.trim()) {
      where.city = { equals: params.city.trim(), mode: "insensitive" };
    }
    if (params.q?.trim()) {
      where.OR = [
        { name: { contains: params.q.trim(), mode: "insensitive" } },
        { description: { contains: params.q.trim(), mode: "insensitive" } },
      ];
    }
    if (params.category?.trim()) {
      where.categories = { some: { category: { slug: params.category.trim() } } };
    }

    const hasGeo = typeof params.lat === "number" && typeof params.lng === "number";
    if (hasGeo) {
      const radius = params.radiusKm ?? 25;
      const dLat = radius / KM_PER_DEG_LAT;
      const dLng =
        radius / (KM_PER_DEG_LAT * Math.max(0.01, Math.cos((params.lat! * Math.PI) / 180)));
      where.latitude = { gte: params.lat! - dLat, lte: params.lat! + dLat };
      where.longitude = { gte: params.lng! - dLng, lte: params.lng! + dLng };
    }

    const tenants = await this.prisma.tenant.findMany({
      where,
      take: params.take ?? 50,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        city: true,
        neighborhood: true,
        priceRange: true,
        logoUrl: true,
        latitude: true,
        longitude: true,
        categories: { include: { category: { select: { name: true, slug: true } } } },
      },
    });

    const ratings = await this.ratingsByTenant(tenants.map((t) => t.id));

    const results = tenants.map((tenant) => {
      const distanceKm =
        hasGeo && tenant.latitude != null && tenant.longitude != null
          ? this.approxDistanceKm(params.lat!, params.lng!, tenant.latitude, tenant.longitude)
          : null;
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        description: tenant.description,
        city: tenant.city,
        neighborhood: tenant.neighborhood,
        priceRange: tenant.priceRange,
        logoUrl: tenant.logoUrl,
        categories: tenant.categories.map((c) => c.category),
        rating: ratings.get(tenant.id) ?? { average: null, count: 0 },
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      };
    });

    results.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      return (b.rating.average ?? 0) - (a.rating.average ?? 0);
    });
    return results;
  }

  async establishmentProfile(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, listedInMarketplace: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        city: true,
        neighborhood: true,
        businessHours: true,
        priceRange: true,
        logoUrl: true,
        whatsappNumber: true,
        instagramUrl: true,
        latitude: true,
        longitude: true,
        categories: { include: { category: { select: { name: true, slug: true } } } },
        galleryImages: { orderBy: { position: "asc" }, select: { id: true, url: true } },
        services: {
          where: { isActive: true },
          select: { id: true, name: true, durationMinutes: true, priceCents: true },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException("Estabelecimento não encontrado no marketplace.");
    }

    const [rating, reviews] = await Promise.all([
      this.ratingsByTenant([tenant.id]),
      this.prisma.review.findMany({
        where: { tenantId: tenant.id, status: ReviewStatus.VISIBLE },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          consumer: { select: { name: true } },
        },
      }),
    ]);

    return {
      ...tenant,
      categories: tenant.categories.map((c) => c.category),
      rating: rating.get(tenant.id) ?? { average: null, count: 0 },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        authorName: r.consumer.name,
      })),
    };
  }

  listCities() {
    return this.prisma.tenant
      .findMany({
        where: { listedInMarketplace: true, city: { not: null } },
        distinct: ["city"],
        select: { city: true },
        orderBy: { city: "asc" },
      })
      .then((rows) => rows.map((r) => r.city).filter((c): c is string => !!c));
  }

  private async ratingsByTenant(tenantIds: string[]) {
    if (tenantIds.length === 0) return new Map<string, { average: number | null; count: number }>();
    const grouped = await this.prisma.review.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, status: ReviewStatus.VISIBLE },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      grouped.map((g) => [
        g.tenantId,
        {
          average: g._avg.rating != null ? Math.round(g._avg.rating * 10) / 10 : null,
          count: g._count._all,
        },
      ]),
    );
  }

  private approxDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const x = ((lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))) * KM_PER_DEG_LAT;
    const y = (lat2 - lat1) * KM_PER_DEG_LAT;
    return Math.sqrt(x * x + y * y);
  }
}

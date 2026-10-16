import type { MetadataRoute } from "next";
import type { MarketplaceResult } from "@marquo/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/descobrir`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/para-donos`, changeFrequency: "monthly", priority: 0.6 },
  ];

  try {
    const res = await fetch(`${API_URL}/public/marketplace/search`, { next: { revalidate: 3600 } });
    if (!res.ok) return base;
    const establishments = (await res.json()) as MarketplaceResult[];
    return [
      ...base,
      ...establishments.map((e) => ({
        url: `${SITE_URL}/${e.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return base;
  }
}

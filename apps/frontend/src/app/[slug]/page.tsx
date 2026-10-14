import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "./layout";
import { publicApi } from "@/lib/api";
import { marketplaceApi } from "@/lib/marketplace-api";
import { ApiError } from "@/lib/api";
import { getNavSession } from "@/lib/nav-session";
import { TenantProfileHeader } from "@/components/tenant-profile/TenantProfileHeader";
import { ServicesSection } from "@/components/tenant-profile/ServicesSection";
import { TeamSection } from "@/components/tenant-profile/TeamSection";
import { GallerySection } from "@/components/tenant-profile/GallerySection";
import { ContactSection } from "@/components/tenant-profile/ContactSection";
import { ReviewsSection } from "@/components/tenant-profile/ReviewsSection";

// Avaliações e categorias (tags do header) só existem pra tenant com
// listedInMarketplace: true (é o que a rota de marketplace exige) — não é toggle de
// exibição, é ausência de dado mesmo pra quem não está listado, então 404 aqui é
// esperado, não erro.
async function getMarketplaceData(slug: string) {
  try {
    const establishment = await marketplaceApi.establishment(slug);
    return {
      rating: establishment.rating,
      reviews: establishment.reviews,
      categories: establishment.categories,
    };
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenant(slug);
  return { title: tenant ? `${tenant.name} - Marquo` : "Negócio não encontrado" };
}

export default async function TenantProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // O layout (app/[slug]/layout.tsx) chama notFound() se o tenant não existisse, mas isso
  // não impede este componente de renderizar no mesmo passe — precisa da própria checagem
  // (getTenant é cache()d, então isso não gera outro fetch).
  const tenant = await getTenant(slug);
  if (!tenant) {
    notFound();
  }

  const [services, team, marketplaceData, session] = await Promise.all([
    tenant.showServices ? publicApi.getServices(slug) : Promise.resolve([]),
    tenant.showTeam ? publicApi.getTeam(slug) : Promise.resolve([]),
    getMarketplaceData(slug),
    getNavSession(),
  ]);

  return (
    <main className="flex-1 bg-stone-50 dark:bg-zinc-950">
      <TenantProfileHeader
        tenant={tenant}
        rating={marketplaceData?.rating ?? null}
        categories={marketplaceData?.categories ?? []}
        session={session}
        servicesCount={services.length}
        teamCount={team.length}
      />
      {/* Ordem por prioridade real de decisão do cliente, não pela ordem em que os
          dados foram implementados: 1) prova visual do trabalho (o que mais pesa
          pra negócio de beleza) 2) o que tem e quanto custa 3) prova social
          reforçando a decisão 4) quem vai atender 5) logística de "como chegar",
          que só importa depois que a pessoa já decidiu marcar. */}
      {tenant.showGallery ? <GallerySection images={tenant.galleryImages} /> : null}
      {tenant.showServices ? <ServicesSection slug={slug} services={services} /> : null}
      {marketplaceData ? (
        <ReviewsSection rating={marketplaceData.rating} reviews={marketplaceData.reviews} />
      ) : null}
      {tenant.showTeam ? <TeamSection slug={slug} team={team} /> : null}
      {tenant.showContact ? <ContactSection tenant={tenant} /> : null}
    </main>
  );
}

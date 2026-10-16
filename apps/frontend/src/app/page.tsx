import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { NearbyPlaces } from "@/components/marketing/NearbyPlaces";
import { TopRatedPlaces } from "@/components/marketing/TopRatedPlaces";
import { Footer } from "@/components/marketing/Footer";
import { getNavSession } from "@/lib/nav-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function getCities(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/public/marketplace/cities`, {
      next: { revalidate: 300 },
    });
    return res.ok ? ((await res.json()) as string[]) : [];
  } catch {
    return [];
  }
}

// A home é para quem procura um salão: busca, os mais próximos (com a localização do
// visitante, só se ele permitir) e os mais bem avaliados. Quem tem um negócio e quer entrar
// na plataforma vai pelo botão "Para donos" da barra, que leva a /para-donos.
export default async function Home() {
  const [cities, session] = await Promise.all([getCities(), getNavSession()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav session={session} />
      <main className="flex-1">
        <Hero cities={cities} />
        <NearbyPlaces />
        <TopRatedPlaces />
      </main>
      <Footer />
    </div>
  );
}

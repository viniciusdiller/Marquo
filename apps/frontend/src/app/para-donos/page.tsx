import type { Metadata } from "next";
import { Nav } from "@/components/marketing/Nav";
import { OwnerHero } from "@/components/marketing/OwnerHero";
import { ProblemSolution } from "@/components/marketing/ProblemSolution";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Features } from "@/components/marketing/Features";
import { OwnerCta } from "@/components/marketing/OwnerCta";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Footer } from "@/components/marketing/Footer";
import { getNavSession } from "@/lib/nav-session";

export const metadata: Metadata = {
  title: "Para donos de salão e barbearia | Marquo",
  description:
    "Veja como o Marquo funciona para donos de salão e barbearia: agenda online, equipe, comandas e uma página própria que aparece na busca de clientes.",
};

// Página só explicativa para quem tem um negócio (a home é para o cliente final). Reúne o
// conteúdo de venda que antes ficava na home; as âncoras #como-funciona/#recursos/#faq do
// rodapé existem aqui.
export default async function ParaDonosPage() {
  const session = await getNavSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav session={session} />
      <main className="flex-1">
        <OwnerHero />
        <ProblemSolution />
        <HowItWorks />
        <Features />
        <OwnerCta />
        <Faq />
        <FinalCta />
      </main>
      <Footer ownerPage />
    </div>
  );
}

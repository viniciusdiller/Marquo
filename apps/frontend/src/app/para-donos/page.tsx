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
  title: "Para donos de salão e barbearia",
  description:
    "Veja como o Marquo funciona para donos de salão e barbearia: agenda online, equipe, comandas e uma página própria que aparece na busca de clientes.",
  alternates: {
    canonical: "/para-donos",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Preciso de cartão de crédito para testar o Marquo?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não. Você usa qualquer plano por 14 dias sem informar cartão. Só pedimos os dados de pagamento quando você decidir continuar.",
      },
    },
    {
      "@type": "Question",
      name: "O Marquo cobra alguma coisa do meu cliente?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não. O pagamento do serviço continua sendo combinado direto entre você e o cliente, do jeito que já funciona hoje. Cobramos só a assinatura mensal do seu negócio.",
      },
    },
    {
      "@type": "Question",
      name: "O cliente precisa criar uma conta para agendar?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não. Ele acessa o link do seu negócio, escolhe o serviço, o profissional e o horário, e deixa só nome e telefone.",
      },
    },
    {
      "@type": "Question",
      name: "Dá para cadastrar mais de um profissional no Marquo?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim. Cada profissional tem sua própria agenda e horário de trabalho. O número de profissionais incluído depende do plano escolhido.",
      },
    },
    {
      "@type": "Question",
      name: "Posso trocar de plano no Marquo depois?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim, a qualquer momento. Para reduzir o plano, é preciso ter no máximo o número de profissionais que o novo plano permite.",
      },
    },
  ],
};

// Página só explicativa para quem tem um negócio (a home é para o cliente final). Reúne o
// conteúdo de venda que antes ficava na home; as âncoras #como-funciona/#recursos/#faq do
// rodapé existem aqui.
export default async function ParaDonosPage() {
  const session = await getNavSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
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

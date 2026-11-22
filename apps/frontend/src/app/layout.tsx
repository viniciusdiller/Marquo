import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import { PLAN_CATALOG } from "@marquo/shared-types";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FloatingThemeToggle } from "@/components/ui/FloatingThemeToggle";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

// Só pro wordmark da marca (components/brand/Logo.tsx) — não substitui --font-display,
// que segue usado nos headings do site inteiro.
const brand = Outfit({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["700"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marquo.com.br";

// Perfis oficiais da marca (Instagram, LinkedIn...). Ligam o site aos perfis no "painel de conhecimento" do Google
// quando alguém pesquisa "Marquo". Só entram no JSON-LD se houver algum.
const SOCIAL_PROFILES: string[] = [];

// Faixa real de preço dos planos (a mesma do catálogo), em reais.
const PLAN_PRICES = PLAN_CATALOG.map((plan) => plan.priceCents / 100);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Marquo - Agenda online para salões e barbearias",
    template: "%s | Marquo",
  },
  description:
    "Marquo é a plataforma de agenda online para salões de beleza e barbearias. Cada profissional com sua própria agenda, cliente marca pelo link sem precisar criar conta. Teste grátis por 14 dias.",
  applicationName: "Marquo",
  keywords: [
    "Marquo",
    "Marquo app",
    "Marquo agendamentos",
    "agenda online",
    "agendamento para salão",
    "sistema de agendamento barbearia",
    "software para salão de beleza",
    "marcar horário online",
    "gestão de salão",
  ],
  authors: [{ name: "Marquo" }],
  creator: "Marquo",
  publisher: "Marquo",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // A imagem (og:image) vem de app/opengraph-image.tsx, em 1200x630.
  openGraph: {
    title: "Marquo - Agenda online para salões e barbearias",
    description:
      "Cada profissional com sua própria agenda online. Cliente marca pelo link, sem complicação.",
    url: SITE_URL,
    siteName: "Marquo",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Marquo - Agenda online para salões e barbearias",
    description:
      "Cada profissional com sua própria agenda online. Cliente marca pelo link, sem complicação.",
  },
  // Código da verificação por meta tag do Google Search Console (opcional: a verificação por DNS dispensa).
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Marquo",
      url: SITE_URL,
      // Logo QUADRADA: o Google pede no mínimo 112x112 e recorta logos muito largas.
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon-512.png`,
        width: 512,
        height: 512,
      },
      description:
        "Plataforma de agenda online e gestão para salões de beleza, barbearias e profissionais da estética.",
      ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Marquo",
      // Ajuda o Google a mostrar "Marquo" como nome do site nos resultados.
      alternateName: ["Marquo Agenda", "marquo.com.br"],
      inLanguage: "pt-BR",
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/descobrir?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Marquo",
      url: SITE_URL,
      operatingSystem: "Web",
      applicationCategory: "BusinessApplication",
      publisher: { "@id": `${SITE_URL}/#organization` },
      // Preços reais dos planos mensais (antes dizia "grátis", o que não é verdade fora do período de teste).
      offers: {
        "@type": "AggregateOffer",
        lowPrice: Math.min(...PLAN_PRICES).toFixed(2),
        highPrice: Math.max(...PLAN_PRICES).toFixed(2),
        offerCount: PLAN_PRICES.length,
        priceCurrency: "BRL",
      },
    },
  ],
};

// Tema decidido no servidor a partir do cookie "theme" (gravado por ThemeProvider.toggleTheme)
// — a classe .dark já sai certa no HTML antes do primeiro paint, sem script inline e sem risco
// de flash. Padrão é sempre claro pra visita nova; só fica escuro se o usuário já escolheu isso
// antes (cookie ausente != "dark").
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${body.variable} ${brand.variable}${theme === "dark" ? " dark" : ""}`}
    >
      {/* suppressHydrationWarning: extensões do navegador (ex.: ColorZilla injeta cz-shortcut-listen)
          alteram atributos do <body> antes do React hidratar; só silencia o <body>, não os filhos. */}
      <body
        suppressHydrationWarning
        className="min-h-dvh bg-stone-50 font-body text-zinc-900 antialiased dark:bg-zinc-950 dark:text-stone-100"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider initialTheme={theme}>
          {children}
          <FloatingThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}

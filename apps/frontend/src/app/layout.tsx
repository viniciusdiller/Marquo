import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FloatingThemeToggle } from "@/components/ui/FloatingThemeToggle";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Só pro wordmark da marca (components/brand/Logo.tsx) — não substitui --font-display,
// que segue usado nos headings do site inteiro.
const brand = Outfit({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Marquo - Agenda online para salões e barbearias",
  description:
    "Cada profissional com sua própria agenda online. Cliente marca pelo link, sem criar conta. Teste grátis por 14 dias, sem cartão.",
  keywords: [
    "agenda online",
    "agendamento para salão",
    "sistema de agendamento barbearia",
    "software para salão de beleza",
  ],
  openGraph: {
    title: "Marquo - Agenda online para salões e barbearias",
    description:
      "Cada profissional com sua própria agenda online. Cliente marca pelo link, sem criar conta.",
  },
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
        <ThemeProvider initialTheme={theme}>
          {children}
          <FloatingThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}

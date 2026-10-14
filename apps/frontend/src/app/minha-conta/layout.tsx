import { SiteHeader } from "@/components/account/SiteHeader";
import { BRAND } from "@/components/brand/palette";
import { BrandPattern } from "@/components/brand/BrandPattern";

// Área do cliente final (conta global, fora de /[slug]). Reusa componentes que leem
// --tenant-accent (Input accentScoped, Button "tenant") definindo a paleta fixa da marca aqui —
// mesmo critério do layout do salão: identidade Marquo, sem customização por tenant.
export default function MinhaContaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          "--tenant-accent": BRAND.primary,
          "--tenant-accent-secondary": BRAND.accentCheck,
        } as React.CSSProperties
      }
      className="relative isolate flex min-h-dvh flex-col bg-stone-50 dark:bg-zinc-950"
    >
      <BrandPattern mask="linear-gradient(to bottom, black, transparent 360px)" />
      <SiteHeader narrow />
      {children}
    </div>
  );
}

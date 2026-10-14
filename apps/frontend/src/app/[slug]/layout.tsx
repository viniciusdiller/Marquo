import { cache } from "react";
import { notFound } from "next/navigation";
import { publicApi, ApiError } from "@/lib/api";
import { TenantFooter } from "@/components/tenant-profile/TenantFooter";
import { BRAND } from "@/components/brand/palette";

// cache() dedupa chamadas repetidas dentro da mesma requisição: layout + page (e
// agendar/entrar/conta) podem cada um chamar getTenant(slug) sem gerar fetches extras.
export const getTenant = cache(async (slug: string) => {
  try {
    return await publicApi.getTenant(slug);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
});

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getTenant(slug);

  if (!tenant) {
    notFound();
  }

  return (
    <div
      // Paleta fixa da marca Marquo (roxo + coral, ver components/brand/palette.ts) —
      // decisão consciente de não usar mais tenant.accentColor aqui: a página pública do
      // salão segue a identidade visual do Marquo em vez de customização por tenant.
      // O campo "Cor de destaque" em dashboard/configuracoes continua salvando no banco,
      // mas não é mais lido nesta página.
      style={
        {
          "--tenant-accent": BRAND.primary,
          "--tenant-accent-secondary": BRAND.accentCheck,
        } as React.CSSProperties
      }
      className="flex min-h-dvh flex-col"
    >
      {children}
      <TenantFooter tenant={tenant} />
    </div>
  );
}

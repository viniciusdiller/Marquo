import { InstagramLogo, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { PublicTenant } from "@marquo/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Cartão de link, não embed de verdade: o Instagram bloqueia iframe da própria página
// de perfil via CSP (frame-ancestors), então um <iframe src="instagram.com/...">
// simplesmente não carrega. Mostrar posts reais exigiria a Graph API com OAuth por
// tenant (fora de escopo aqui) — isto entrega presença visual sem fingir um feed que
// não existe.
function instagramHandle(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "").split("/").pop();
    return path ? `@${path}` : null;
  } catch {
    return null;
  }
}

export function InstagramCard({ tenant }: { tenant: PublicTenant }) {
  // Defesa em profundidade: linhas antigas podem ter um valor salvo antes da validação de
  // protocolo no backend; só http(s) vira link (javascript:/data: nunca chegam ao href).
  if (!tenant.instagramUrl || !/^https?:\/\//i.test(tenant.instagramUrl)) return null;
  const handle = instagramHandle(tenant.instagramUrl);

  return (
    <a
      href={tenant.instagramUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-1 items-center gap-4 rounded-3xl border border-zinc-200 p-5 transition-colors hover:border-[#dc2743]/40 dark:border-white/10"
    >
      <span className="shrink-0 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2.5px]">
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-zinc-900">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}${tenant.logoUrl}?v=${encodeURIComponent(tenant.updatedAt)}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <InstagramLogo size={22} weight="bold" className="text-[#dc2743]" />
          )}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-medium text-zinc-900 dark:text-white">{tenant.name}</span>
        <span className="block text-sm text-zinc-500 dark:text-stone-400">{handle ?? "Instagram"}</span>
      </span>

      <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-[#dc2743] sm:flex">
        Ver perfil
        <ArrowUpRight size={14} />
      </span>
    </a>
  );
}

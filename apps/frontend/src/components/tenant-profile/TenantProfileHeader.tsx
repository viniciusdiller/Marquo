import {
  ArrowRight,
  InstagramLogo,
  MapPin,
  Star,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { MarketplaceRating, PublicTenant } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { TenantTopBar } from "./TenantTopBar";
import { BRAND } from "../brand/palette";
import type { NavSession } from "@/lib/nav-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function TenantProfileHeader({
  tenant,
  rating,
  categories,
  session,
  servicesCount,
  teamCount,
}: {
  tenant: PublicTenant;
  rating: MarketplaceRating | null;
  categories: Array<{ name: string; slug: string }>;
  session: NavSession;
  servicesCount: number;
  teamCount: number;
}) {
  // A primeira foto da galeria dobra como capa do hero — não é um campo separado no
  // banco (não existe upload de "foto de capa" hoje), só reaproveita a mesma imagem
  // que o dono já mandou pra galeria.
  const cover = tenant.galleryImages[0] ?? null;

  return (
    <>
      {/* Barra fixa própria (TenantTopBar) — mesmo peso visual que a marca tem no site
          principal (ver Nav.tsx), não um selo pequeno num canto. */}
      <TenantTopBar slug={tenant.slug} session={session} />

      <section className="pt-16">
        <Container className="pt-8">
          <div className="relative overflow-hidden rounded-3xl bg-(--tenant-accent)/10">
            <div className="h-[220px] sm:h-[280px]">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_URL}${cover.url}`} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>

          <div className="relative -mt-14 grid gap-7 sm:-mt-16 lg:grid-cols-[1.55fr_1fr] lg:items-start">
            <Reveal>
              <div className="relative flex flex-col gap-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-7 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start gap-5">
                  {tenant.logoUrl ? (
                    <div className="-mt-16 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-(--tenant-accent)/10 shadow-lg sm:-mt-20 sm:h-[104px] sm:w-[104px] dark:border-zinc-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${API_URL}${tenant.logoUrl}?v=${encodeURIComponent(tenant.updatedAt)}`}
                        alt={tenant.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}

                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <h1 className="font-brand text-3xl font-bold tracking-tight text-zinc-900 sm:text-[38px] dark:text-white">
                      {tenant.name}
                    </h1>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-zinc-500 dark:text-stone-400">
                      {rating?.average != null ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
                          <Star size={15} weight="fill" className="text-(--tenant-accent-secondary)" />
                          {rating.average.toFixed(1)}{" "}
                          <span className="font-normal text-zinc-500 dark:text-stone-400">
                            ({rating.count} {rating.count === 1 ? "avaliação" : "avaliações"})
                          </span>
                        </span>
                      ) : null}
                      {tenant.address ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin size={15} className="shrink-0" />
                          {tenant.address}
                        </span>
                      ) : null}
                    </div>

                    {categories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categories.map((category) => (
                          <span
                            key={category.slug}
                            className="rounded-full bg-(--tenant-accent)/10 px-3 py-1.5 text-xs font-semibold text-(--tenant-accent)"
                          >
                            {category.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {tenant.description ? (
                  <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
                    {tenant.description}
                  </p>
                ) : null}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <aside
                className="flex flex-col gap-4 rounded-3xl p-6 text-white lg:sticky lg:top-24"
                style={{ backgroundColor: BRAND.darkBg }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold tracking-[0.1em] text-white/50 uppercase">
                    Agende online
                  </span>
                  <span className="font-brand text-xl font-bold tracking-tight">
                    Escolha um serviço e marque seu horário
                  </span>
                </div>

                <a
                  href="#servicos"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-(--tenant-accent) px-4 py-3.5 font-brand text-[15px] font-semibold text-white transition-[filter] hover:brightness-90"
                >
                  Escolher serviço
                  <ArrowRight size={17} />
                </a>

                {tenant.whatsappNumber || tenant.instagramUrl ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {tenant.whatsappNumber ? (
                      <a
                        href={`https://wa.me/${tenant.whatsappNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold transition-colors hover:border-[#25D366]/60 hover:text-[#25D366]"
                      >
                        <WhatsappLogo size={17} weight="fill" className="shrink-0" />
                        WhatsApp
                      </a>
                    ) : null}
                    {tenant.instagramUrl ? (
                      <a
                        href={tenant.instagramUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold transition-colors hover:border-(--tenant-accent-secondary)/60 hover:text-(--tenant-accent-secondary)"
                      >
                        <InstagramLogo size={17} weight="bold" className="shrink-0" />
                        Instagram
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {(tenant.showServices && servicesCount > 0) || (tenant.showTeam && teamCount > 0) ? (
                  <>
                    <div className="h-px bg-white/10" />
                    <div className="flex flex-col gap-2 text-sm text-white/60">
                      {tenant.showServices && servicesCount > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span>Serviços</span>
                          <span className="font-semibold text-white">{servicesCount}</span>
                        </div>
                      ) : null}
                      {tenant.showTeam && teamCount > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span>Profissionais</span>
                          <span className="font-semibold text-white">{teamCount}</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </aside>
            </Reveal>
          </div>
        </Container>
      </section>
    </>
  );
}

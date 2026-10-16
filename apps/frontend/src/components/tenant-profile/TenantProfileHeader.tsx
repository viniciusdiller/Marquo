import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Info,
  InstagramLogo,
  MapPin,
  Star,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import type { MarketplaceRating, PublicTenant } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { TenantTopBar } from "./TenantTopBar";
import { BRAND } from "../brand/palette";
import { BrandPattern } from "../brand/BrandPattern";
import { initials } from "../ui/Avatar";
import { LogoViewer } from "./LogoViewer";
import type { SectionNavItem } from "./TenantSectionNav";
import type { NavSession } from "@/lib/nav-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function TenantProfileHeader({
  tenant,
  rating,
  categories,
  session,
  servicesCount,
  teamCount,
  sections = [],
  children,
}: {
  tenant: PublicTenant;
  rating: MarketplaceRating | null;
  categories: Array<{ name: string; slug: string }>;
  session: NavSession;
  servicesCount: number;
  teamCount: number;
  // Atalhos das seções (vão para a barra do topo).
  sections?: SectionNavItem[];
  // Conteúdo que sobe para a coluna da esquerda, logo abaixo do cartão de identidade (os serviços), ao lado do
  // cartão "Agende online".
  children?: React.ReactNode;
}) {
  // A primeira foto da galeria dobra como capa do hero — não é um campo separado no
  // banco (não existe upload de "foto de capa" hoje), só reaproveita a mesma imagem
  // que o dono já mandou pra galeria.
  const cover = tenant.galleryImages[0] ?? null;
  const hasContactBlock =
    tenant.showContact && Boolean(tenant.address || tenant.businessHours || tenant.whatsappNumber || tenant.instagramUrl);

  return (
    <>
      {/* Barra fixa própria (TenantTopBar) — mesmo peso visual que a marca tem no site
          principal (ver Nav.tsx), não um selo pequeno num canto. */}
      <TenantTopBar slug={tenant.slug} session={session} sections={sections} />

      {/* A barra fixa tem 1 linha no desktop e 2 (com os atalhos) no celular/tablet. */}
      <section className={sections.length >= 2 ? "pt-28 lg:pt-16" : "pt-16"}>
        <Container className="pt-6">
          {/* Capa: a primeira foto da galeria; sem foto, um fundo da marca (degradê + padrão) para a página não
              ficar com um bloco vazio. */}
          <div className="relative isolate h-[180px] overflow-hidden rounded-3xl bg-gradient-to-br from-(--tenant-accent)/25 via-(--tenant-accent)/10 to-(--tenant-accent-secondary)/20 sm:h-[250px]">
            {cover ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API_URL}${cover.url}`} alt="" className="h-full w-full object-cover" />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-zinc-950/35 via-transparent to-transparent" />
              </>
            ) : (
              <BrandPattern mask="radial-gradient(ellipse 80% 90% at 70% 40%, black 0%, transparent 80%)" />
            )}
          </div>

          <div className="relative -mt-12 grid gap-7 sm:-mt-14 lg:grid-cols-[1.55fr_1fr] lg:items-start">
            <Reveal className="order-1 lg:col-start-1 lg:row-start-1">
              {/* A logo fica DENTRO do cartão, à esquerda do texto (no celular, acima dele): nada sobressai da caixa. */}
              <div className="flex flex-col gap-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:gap-7 sm:p-7 dark:border-white/10 dark:bg-zinc-900">
                <div className="size-28 shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-900/10 sm:size-36 dark:bg-zinc-900 dark:ring-white/15">
                  {tenant.logoUrl ? (
                    <LogoViewer
                      src={`${tenant.logoUrl}?v=${encodeURIComponent(tenant.updatedAt)}`}
                      name={tenant.name}
                      className="h-full w-full"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-(--tenant-accent) to-(--tenant-accent)/70 font-brand text-4xl font-bold text-white sm:text-5xl"
                    >
                      {initials(tenant.name)}
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <h1 className="font-brand text-3xl font-bold tracking-tight text-balance text-zinc-900 sm:text-[38px] dark:text-white">
                    {tenant.name}
                  </h1>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-zinc-500 dark:text-stone-400">
                    {rating?.average != null ? (
                      <a
                        href="#avaliacoes"
                        className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 hover:text-(--tenant-accent) dark:text-white"
                      >
                        <Star size={15} weight="fill" className="text-(--tenant-accent-secondary)" />
                        {rating.average.toFixed(1).replace(".", ",")}{" "}
                        <span className="font-normal text-zinc-500 underline-offset-2 hover:underline dark:text-stone-400">
                          ({rating.count} {rating.count === 1 ? "avaliação" : "avaliações"})
                        </span>
                      </a>
                    ) : null}
                    {tenant.address ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={15} className="shrink-0" />
                        {tenant.address}
                      </span>
                    ) : null}
                    {hasContactBlock ? (
                      <a
                        href="#contato"
                        className="inline-flex items-center gap-1.5 font-semibold text-(--tenant-accent) hover:underline"
                      >
                        <Info size={15} weight="bold" className="shrink-0" />
                        Informações
                      </a>
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

                  {tenant.description ? (
                    <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-stone-300">
                      {tenant.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </Reveal>

            {/* Fixo na grade (sem sticky): acompanhar a rolagem dava a sensação de "balanço". */}
            <div className="order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <Reveal delay={0.1}>
              <aside
                className="flex flex-col gap-5 rounded-3xl p-8 text-white"
                style={{ backgroundColor: BRAND.darkBg }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold tracking-[0.1em] text-white/50 uppercase">
                    Agende online
                  </span>
                  <span className="font-brand text-2xl font-bold tracking-tight">
                    Escolha um serviço e marque seu horário
                  </span>
                </div>

                <a
                  href="#servicos"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-(--tenant-accent) px-5 py-4 font-brand text-base font-semibold text-white transition-[filter] hover:brightness-90"
                >
                  Escolher serviço
                  <ArrowRight size={17} />
                </a>

                {/* Localização e contato aqui em cima, perto do botão de agendar (o respeito ao "mostrar contato" do dono vale
                    para tudo: endereço, horário, WhatsApp e Instagram). */}
                {hasContactBlock ? (
                  <>
                    <div className="h-px bg-white/10" />
                    <div id="contato" className="flex scroll-mt-28 flex-col gap-3">
                      <span className="text-xs font-bold tracking-[0.1em] text-white/50 uppercase">
                        Localização e contato
                      </span>

                      {tenant.address ? (
                        <div className="flex items-start gap-2.5 text-sm">
                          <MapPin size={17} className="mt-0.5 shrink-0 text-white/60" />
                          <div className="min-w-0">
                            <p className="text-white/90">{tenant.address}</p>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
                            >
                              Como chegar
                              <ArrowUpRight size={13} weight="bold" />
                            </a>
                          </div>
                        </div>
                      ) : null}

                      {tenant.address ? (
                        // Mesmo mapa embutido da seção de baixo (derivado do endereço em texto, sem chave de API; o
                        // frame-src do CSP já libera o Google Maps). Dá para arrastar e dar zoom.
                        <div className="relative h-60 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                          <iframe
                            title={`Mapa de ${tenant.name}`}
                            src={`https://www.google.com/maps?q=${encodeURIComponent(tenant.address)}&output=embed`}
                            className="absolute inset-0 h-full w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      ) : null}

                      {tenant.businessHours ? (
                        <div className="flex items-start gap-2.5 text-sm">
                          <Clock size={17} className="mt-0.5 shrink-0 text-white/60" />
                          <p className="whitespace-pre-line text-white/90">{tenant.businessHours}</p>
                        </div>
                      ) : null}

                      {tenant.whatsappNumber || tenant.instagramUrl ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          {tenant.whatsappNumber ? (
                            <a
                              href={`https://wa.me/${tenant.whatsappNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              className={clsx(
                                "flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold transition-colors hover:border-[#25D366]/60 hover:text-[#25D366]",
                                !tenant.instagramUrl && "col-span-2",
                              )}
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
                              className={clsx(
                                "flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold transition-colors hover:border-(--tenant-accent-secondary)/60 hover:text-(--tenant-accent-secondary)",
                                !tenant.whatsappNumber && "col-span-2",
                              )}
                            >
                              <InstagramLogo size={17} weight="bold" className="shrink-0" />
                              Instagram
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </>
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

            {children ? <div className="order-3 min-w-0 pb-12 lg:col-start-1 lg:row-start-2">{children}</div> : null}
          </div>
        </Container>
      </section>
    </>
  );
}

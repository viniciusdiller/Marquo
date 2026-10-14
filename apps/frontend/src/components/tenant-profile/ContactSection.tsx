import { MapPin, Clock, WhatsappLogo, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { PublicTenant } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";
import { InstagramCard } from "./InstagramCard";

export function ContactSection({ tenant }: { tenant: PublicTenant }) {
  const hasInfo = Boolean(tenant.address || tenant.businessHours);
  const hasWhatsapp = Boolean(tenant.whatsappNumber);
  const hasInstagram = Boolean(tenant.instagramUrl);
  if (!hasInfo && !hasWhatsapp && !hasInstagram) return null;

  return (
    <Reveal>
      <section className="border-t border-zinc-200 py-16 dark:border-white/10">
        <Container>
          <SectionHeading eyebrow="Como chegar" title="Localização e contato" />

          <div className="mt-8 grid gap-5 lg:grid-cols-5 lg:items-stretch">
            {tenant.address ? (
              // Embed derivado do endereço em texto livre (sem chave de API) — não
              // pointer-events-none como antes: dá pra arrastar/zoom no mapa mesmo,
              // clique fora do mapa em si ainda abre a rota completa no Google Maps.
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`}
                target="_blank"
                rel="noreferrer"
                className="group relative block min-h-[280px] overflow-hidden rounded-3xl border border-zinc-200 shadow-sm transition-shadow hover:shadow-md lg:col-span-3 dark:border-white/10"
              >
                <iframe
                  title={`Mapa de ${tenant.name}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(tenant.address)}&output=embed`}
                  className="absolute inset-0 h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <span className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur dark:bg-zinc-900/95 dark:text-stone-300">
                  Abrir rota no Google Maps
                  <ArrowUpRight size={14} className="shrink-0" />
                </span>
              </a>
            ) : null}

            <div className="flex flex-col gap-5 lg:col-span-2">
              {hasInfo || hasWhatsapp ? (
                <div className="rounded-3xl border border-zinc-200 p-5 dark:border-white/10">
                  <div className="flex flex-col gap-2.5 text-sm text-zinc-600 dark:text-stone-300">
                    {tenant.address ? (
                      <span className="flex items-center gap-2">
                        <MapPin size={18} className="shrink-0 text-(--tenant-accent)" />
                        {tenant.address}
                      </span>
                    ) : null}
                    {tenant.businessHours ? (
                      <span className="flex items-center gap-2">
                        <Clock size={18} className="shrink-0 text-(--tenant-accent)" />
                        {tenant.businessHours}
                      </span>
                    ) : null}
                  </div>
                  {hasWhatsapp ? (
                    <a
                      href={`https://wa.me/${tenant.whatsappNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-[15px] font-semibold text-white shadow-lg transition-colors hover:bg-[#1cb457]"
                    >
                      <WhatsappLogo size={18} weight="fill" />
                      Chamar no WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : null}

              {hasInstagram ? <InstagramCard tenant={tenant} /> : null}
            </div>
          </div>
        </Container>
      </section>
    </Reveal>
  );
}

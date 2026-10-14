import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { getTenant } from "../layout";
import type { ConsumerMe } from "@marquo/shared-types";
import { consumerAuthedFetch } from "@/lib/consumer-session";
import { formatPhoneBR } from "@/lib/masks";
import { SiteHeader } from "@/components/account/SiteHeader";
import { BookingWizard } from "@/components/booking/BookingWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenant(slug);
  return { title: tenant ? `Agendar em ${tenant.name} - Marquo` : "Negócio não encontrado" };
}

export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // O layout já chama notFound() se o tenant não existisse, mas isso não impede este
  // componente de renderizar no mesmo passe — precisa da própria checagem.
  const tenant = await getTenant(slug);
  if (!tenant) {
    notFound();
  }

  // Agendar exige conta (não existe mais agendamento sem login): sem sessão válida, vai pro
  // login e volta pra cá depois.
  const consumer = await consumerAuthedFetch<ConsumerMe>("/public/consumer/me").catch(() => null);
  if (!consumer) {
    redirect(`/entrar?next=${encodeURIComponent(`/${slug}/agendar`)}`);
  }

  return (
    <>
    <SiteHeader />
    <main className="flex-1 bg-stone-50 px-6 py-10 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href={`/${tenant.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          <ArrowLeft size={16} />
          {tenant.name}
        </Link>
      </div>

      <div className="mt-6">
        <BookingWizard
          slug={tenant.slug}
          tenantName={tenant.name}
          client={{ name: consumer.name, phone: formatPhoneBR(consumer.phone) }}
        />
      </div>
    </main>
    </>
  );
}

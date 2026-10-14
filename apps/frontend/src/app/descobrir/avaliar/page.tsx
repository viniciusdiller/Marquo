import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReviewablePastAppointment } from "@marquo/shared-types";
import { consumerAuthedFetch } from "@/lib/consumer-session";
import { Footer } from "@/components/marketing/Footer";
import { SiteHeader } from "@/components/account/SiteHeader";
import { BackLink } from "@/components/ui/BackLink";
import { ReviewList } from "./ReviewList";

export const metadata: Metadata = { title: "Avaliar visitas - Marquo" };

export default async function AvaliarPage() {
  // Mesma conta global do resto do site (cookie httpOnly único) — sem sessão, vai pro login e
  // volta pra cá.
  const pending = await consumerAuthedFetch<ReviewablePastAppointment[]>(
    "/public/consumer/reviews/pending",
  ).catch(() => null);
  if (!pending) {
    redirect("/entrar?next=/descobrir/avaliar");
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-10">
        <BackLink href="/descobrir" />
        <h1 className="mt-3 font-display text-2xl font-bold text-zinc-900 dark:text-white">
          Avaliar visitas
        </h1>
        <ReviewList pending={pending} />
      </main>
      <Footer />
    </>
  );
}

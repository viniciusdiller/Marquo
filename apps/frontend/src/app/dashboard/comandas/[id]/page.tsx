import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { AdminProduct, Ticket } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { TicketPdv } from "./TicketPdv";

interface CatalogService {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
}
interface TeamMember {
  id: string;
  user: { name: string };
}

export default async function ComandaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let ticket: Ticket;
  try {
    ticket = await authedFetch<Ticket>(`/tickets/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    throw err;
  }

  const [services, products, team] = await Promise.all([
    authedFetch<CatalogService[]>("/services").catch(() => []),
    authedFetch<AdminProduct[]>("/products").catch(() => []),
    authedFetch<TeamMember[]>("/professionals").catch(() => []),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link
        href="/dashboard/comandas"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
      >
        <CaretLeft size={14} />
        Comandas
      </Link>

      <TicketPdv
        initialTicket={ticket}
        services={services.filter((s) => s.isActive)}
        products={products}
        team={team.map((t) => ({ id: t.id, name: t.user.name }))}
      />
    </div>
  );
}

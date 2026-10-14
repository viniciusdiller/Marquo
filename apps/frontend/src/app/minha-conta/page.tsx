import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import type {
  ConsumerDevice,
  ConsumerEstablishment,
  ConsumerMe,
  Paginated,
  PublicBooking,
} from "@marquo/shared-types";
import { consumerAuthedFetch } from "@/lib/consumer-session";
import { formatPhoneBR } from "@/lib/masks";
import { parsePageParam, type SearchParams } from "@/lib/pagination";
import { BackLink } from "@/components/ui/BackLink";
import { Pagination } from "@/components/ui/Pagination";
import { AccountTabs, parseTab } from "@/components/consumer-account/AccountTabs";
import { AppointmentTicket } from "@/components/consumer-account/AppointmentTicket";
import { EstablishmentGrid } from "@/components/consumer-account/EstablishmentGrid";
import { HistoryTimeline } from "@/components/consumer-account/HistoryTimeline";
import { PasswordForm, ProfileForm } from "@/components/consumer-account/ProfileForm";
import { SessionsList } from "@/components/consumer-account/SessionsList";
import { logoutConsumerAction } from "./actions";

export const metadata: Metadata = { title: "Minha conta - Marquo" };

const TIMEZONE = "America/Sao_Paulo";
const PATHNAME = "/minha-conta";
const UPCOMING_PAGE_SIZE = 4;
const HISTORY_PAGE_SIZE = 8;
const ESTABLISHMENTS_PAGE_SIZE = 6;

function fetchPage<T>(path: string, params: Record<string, string | number>) {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  return consumerAuthedFetch<Paginated<T>>(`${path}?${query.toString()}`);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.aba);

  // Cabeçalho e abas sempre precisam do perfil e do próximo horário; o resto só carrega na aba
  // que o usa (e só a fatia da página pedida — nada de histórico inteiro).
  const [me, nextUp] = await Promise.all([
    consumerAuthedFetch<ConsumerMe>("/public/consumer/me").catch(() => null),
    fetchPage<PublicBooking>("/public/consumer/bookings", { scope: "upcoming", pageSize: 1 }).catch(
      () => null,
    ),
  ]);
  if (!me || !nextUp) {
    redirect("/entrar?next=/minha-conta");
  }

  const upcomingPageNumber = parsePageParam(params.proximos);
  const historyPageNumber = parsePageParam(params.historico);
  const establishmentsPageNumber = parsePageParam(params.pagina);

  const [upcoming, history, establishments, sessions] = await Promise.all([
    tab === "agenda"
      ? fetchPage<PublicBooking>("/public/consumer/bookings", {
          scope: "upcoming",
          page: upcomingPageNumber,
          pageSize: UPCOMING_PAGE_SIZE,
        })
      : null,
    tab === "agenda"
      ? fetchPage<PublicBooking>("/public/consumer/bookings", {
          scope: "past",
          page: historyPageNumber,
          pageSize: HISTORY_PAGE_SIZE,
        })
      : null,
    tab === "saloes"
      ? fetchPage<ConsumerEstablishment>("/public/consumer/establishments", {
          page: establishmentsPageNumber,
          pageSize: ESTABLISHMENTS_PAGE_SIZE,
        })
      : null,
    tab === "conta"
      ? consumerAuthedFetch<ConsumerDevice[]>("/public/consumer/sessions").catch(() => [])
      : null,
  ]);

  const next = nextUp.items[0];
  const nextStart = next
    ? DateTime.fromISO(next.startAt).setZone(TIMEZONE).setLocale("pt-BR")
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 pt-10 pb-20">
      <div className="mb-6">
        <BackLink href="/" />
      </div>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent) font-brand text-2xl font-bold text-white">
            {initials(me.name)}
          </span>
          <div>
            <h1 className="font-brand text-4xl leading-none font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
              Olá, {me.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-stone-400">
              {formatPhoneBR(me.phone)}
              {me.email ? ` · ${me.email}` : ""}
            </p>
          </div>
        </div>
        <form action={logoutConsumerAction}>
          <button
            type="submit"
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-900/5 dark:text-stone-300 dark:hover:bg-white/10"
          >
            Sair
          </button>
        </form>
      </header>

      <p className="mt-6 flex items-center gap-2.5 text-sm text-zinc-600 dark:text-stone-300">
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${next ? "bg-(--tenant-accent-secondary)" : "bg-zinc-300 dark:bg-white/20"}`}
        />
        {next && nextStart ? (
          <span>
            Próximo horário:{" "}
            <strong className="font-semibold text-zinc-900 dark:text-white">
              {nextStart.toFormat("cccc, d 'de' LLLL")} às {nextStart.toFormat("HH:mm")}
            </strong>
            {next.tenant ? ` · ${next.tenant.name}` : ""}
          </span>
        ) : (
          <span>Nenhum horário marcado por enquanto.</span>
        )}
      </p>

      <div className="mt-8">
        <AccountTabs active={tab} upcomingCount={nextUp.total} />
      </div>

      <div className="mt-8">
        {tab === "agenda" && upcoming && history ? (
          <div className="flex flex-col gap-12">
            <section aria-labelledby="proximos">
              <h2 id="proximos" className="font-brand text-2xl font-bold text-zinc-900 dark:text-white">
                Próximos horários
              </h2>
              {upcoming.items.length === 0 ? (
                <div className="mt-5 flex flex-col items-start gap-4 rounded-3xl border-2 border-dashed border-zinc-300 p-8 dark:border-white/15">
                  <p className="font-brand text-xl font-bold text-zinc-900 dark:text-white">
                    Nenhum horário marcado
                  </p>
                  <p className="max-w-sm text-sm text-zinc-500 dark:text-stone-400">
                    Escolha um salão e marque em poucos toques. Seus dados já ficam preenchidos.
                  </p>
                  <Link
                    href="/descobrir"
                    className="rounded-xl bg-(--tenant-accent) px-5 py-3 text-sm font-semibold text-white transition-[filter] hover:brightness-90"
                  >
                    Encontrar um salão
                  </Link>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-4">
                  {upcoming.items.map((booking, i) => (
                    <div
                      key={booking.id}
                      className="animate-rise-in"
                      style={{ "--i": Math.min(i, 6) } as React.CSSProperties}
                    >
                      <AppointmentTicket booking={booking} />
                    </div>
                  ))}
                </div>
              )}
              <Pagination
              replace
                className="mt-6"
                label="Paginação dos próximos horários"
                page={upcoming.page}
                pageCount={upcoming.pageCount}
                pathname={PATHNAME}
                searchParams={params}
                paramName="proximos"
              />
            </section>

            {history.total > 0 ? (
              <section aria-labelledby="historico">
                <h2 id="historico" className="font-brand text-2xl font-bold text-zinc-900 dark:text-white">
                  Histórico
                </h2>
                <div className="mt-5">
                  <HistoryTimeline bookings={history.items} />
                </div>
                <Pagination
              replace
                  className="mt-6"
                  label="Paginação do histórico"
                  page={history.page}
                  pageCount={history.pageCount}
                  pathname={PATHNAME}
                  searchParams={params}
                  paramName="historico"
                />
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "saloes" && establishments ? (
          <section aria-labelledby="saloes">
            <h2 id="saloes" className="font-brand text-2xl font-bold text-zinc-900 dark:text-white">
              Salões que você já visitou
            </h2>
            {establishments.items.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-stone-400">
                Quando você marcar seu primeiro horário, o salão aparece aqui.
              </p>
            ) : (
              <div className="mt-5">
                <EstablishmentGrid establishments={establishments.items} />
              </div>
            )}
            <Pagination
              replace
              className="mt-6"
              label="Paginação dos salões"
              page={establishments.page}
              pageCount={establishments.pageCount}
              pathname={PATHNAME}
              searchParams={params}
            />
          </section>
        ) : null}

        {tab === "conta" ? (
          <div className="grid gap-6 md:grid-cols-2">
            <ProfileForm name={me.name} email={me.email} phone={me.phone} />
            <PasswordForm />
            {sessions ? <SessionsList sessions={sessions} /> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

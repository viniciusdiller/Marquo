import Link from "next/link";
import clsx from "clsx";
import { Crown } from "@phosphor-icons/react/dist/ssr";
import type { ClubMemberSummary, ClubOverview, ClubPlanSummary, ClubMembershipState, Paginated } from "@marquo/shared-types";
import { requireArea } from "@/lib/access-server";
import { authedFetch } from "@/lib/api-server";
import { formatBRL, formatDate } from "@/lib/billing";
import { isRedirectError } from "@/lib/redirect";
import { parsePageParam } from "@/lib/pagination";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { ClubToggle } from "./ClubToggle";
import { CreatePlanForm } from "./CreatePlanForm";
import { EnrollMemberForm } from "./EnrollMemberForm";
import { MemberActions } from "./MemberActions";
import { PlanActiveButton } from "./PlanActiveButton";
import { blockedMessage } from "./gate";

const STATE_FILTERS = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "EXPIRED", label: "Vencidos" },
  { value: "CANCELED", label: "Cancelados" },
] as const;

const STATE_LABEL: Record<ClubMembershipState, string> = { ACTIVE: "Ativo", EXPIRED: "Vencido", CANCELED: "Cancelado" };
const STATE_CLASS: Record<ClubMembershipState, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  EXPIRED: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  CANCELED: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-stone-400",
};

const EMPTY_PAGE: Paginated<ClubMemberSummary> = { items: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };

interface ServiceOption {
  id: string;
  name: string;
  isActive: boolean;
}

export default async function ClubPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  await requireArea("clube");

  const sp = await searchParams;
  const state = STATE_FILTERS.some((f) => f.value === sp.estado) ? (sp.estado ?? "") : "";
  const page = parsePageParam(sp.pagina);

  // Erro ao consultar NÃO é "plano sem clube": mostrar o bloqueio por engano esconderia o problema real (backend fora do ar,
  // versão antiga sem a rota). Só redirecionamentos (sessão/cobrança) seguem o caminho normal do app.
  const overview = await authedFetch<ClubOverview>("/club").catch((err) => {
    if (isRedirectError(err)) throw err;
    return null;
  });
  if (!overview) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Clube de assinaturas" description="Pacotes mensais para seus clientes." />
        <div className="mt-6">
          <EmptyState
            icon={Crown}
            title="Não foi possível carregar o clube agora"
            description="Tente de novo em instantes. Se continuar, avise o suporte: não é uma questão do seu plano."
            action={
              <Button href="/dashboard/clube" variant="ghost" className="px-5 py-2.5 text-sm">
                Tentar novamente
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const header = (
    <PageHeader
      title="Clube de assinaturas"
      description="Pacotes mensais para seus clientes: por exemplo, 4 cortes por mês por um valor fixo."
      action={overview.planAllowsClub ? <ClubToggle enabled={overview.enabled} /> : undefined}
    />
  );

  if (!overview.planAllowsClub) {
    const blocked = blockedMessage(overview);
    return (
      <div className="mx-auto w-full max-w-7xl">
        {header}
        <div className="mt-6">
          <EmptyState
            icon={Crown}
            title={blocked.title}
            description={blocked.description}
            action={
              <Button href="/dashboard/plano" className="px-5 py-2.5 text-sm">
                {overview.onTrial ? "Assinar um plano" : "Ver planos"}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (!overview.enabled) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        {header}
        <div className="mt-6">
          <EmptyState
            icon={Crown}
            title="O clube está desligado"
            description="Ative para criar pacotes e inscrever clientes. Você pode desligar quando quiser: nada é apagado."
          />
        </div>
      </div>
    );
  }

  const [plans, members, services] = await Promise.all([
    authedFetch<ClubPlanSummary[]>("/club/plans").catch(() => [] as ClubPlanSummary[]),
    authedFetch<Paginated<ClubMemberSummary>>(`/club/members?page=${page}&pageSize=10${state ? `&state=${state}` : ""}`).catch(() => EMPTY_PAGE),
    authedFetch<ServiceOption[]>("/services").catch(() => [] as ServiceOption[]),
  ]);
  const activeServices = services.filter((s) => s.isActive).map(({ id, name }) => ({ id, name }));
  const activePlans = plans.filter((p) => p.isActive);

  return (
    <div className="mx-auto w-full max-w-7xl">
      {header}

      <div className="mt-6 flex flex-col gap-10">
        <HowItWorks>
          <p>
            Você cria <strong>pacotes</strong> (ex.: 4 cortes por mês), inscreve o cliente e <strong>marca o mês como pago</strong>:
            o pagamento acontece fora do sistema (caixa, Pix seu ou dinheiro).
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Ao <strong>fechar a comanda</strong> de um membro, os serviços do pacote saem sem cobrança até acabarem os usos do mês. A
              baixa é automática.
            </li>
            <li>Os usos que sobram no mês não acumulam. Ao renovar, abre um mês novo e os usos voltam.</li>
            <li>A mensalidade vira receita no Financeiro. A comissão do profissional continua calculada sobre o valor de tabela do serviço.</li>
            <li>Pacotes não mudam depois de criados (usos e serviços): para mudar, crie outro e desative o antigo.</li>
          </ul>
        </HowItWorks>

        <section aria-labelledby="pacotes">
          <h2 id="pacotes" className="font-display text-lg font-bold text-zinc-900 dark:text-white">
            Pacotes
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            {plans.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-stone-400">Nenhum pacote ainda. Crie o primeiro abaixo.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => (
                  <li
                    key={plan.id}
                    className={clsx(
                      "flex flex-col gap-2 rounded-2xl border p-4",
                      plan.isActive ? "border-zinc-200 dark:border-white/10" : "border-dashed border-zinc-300 opacity-70 dark:border-white/15",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-900 dark:text-white">{plan.name}</p>
                        <p className="text-sm text-zinc-600 dark:text-stone-300">
                          {formatBRL(plan.priceCents)}/mês · {plan.usesPerMonth} {plan.usesPerMonth === 1 ? "uso" : "usos"}
                        </p>
                      </div>
                      <PlanActiveButton id={plan.id} isActive={plan.isActive} />
                    </div>
                    {plan.description ? <p className="text-xs text-zinc-500 dark:text-stone-400">{plan.description}</p> : null}
                    <p className="text-xs text-zinc-500 dark:text-stone-400">{plan.services.map((s) => s.name).join(", ")}</p>
                    <p className="text-xs font-medium text-zinc-600 dark:text-stone-300">
                      {plan.activeMembers} {plan.activeMembers === 1 ? "membro" : "membros"}
                      {!plan.isActive ? " · desativado (sem novas adesões)" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <CreatePlanForm services={activeServices} />
          </div>
        </section>

        <section aria-labelledby="membros">
          <h2 id="membros" className="font-display text-lg font-bold text-zinc-900 dark:text-white">
            Membros
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            <EnrollMemberForm plans={activePlans.map((p) => ({ id: p.id, name: p.name, priceLabel: formatBRL(p.priceCents) }))} />

            <nav aria-label="Filtrar membros" className="flex flex-wrap gap-1.5">
              {STATE_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={filter.value ? `/dashboard/clube?estado=${filter.value}` : "/dashboard/clube"}
                  aria-current={state === filter.value ? "page" : undefined}
                  className={clsx(
                    "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                    state === filter.value
                      ? "bg-accent-500 text-white"
                      : "text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/15 dark:hover:bg-white/10",
                  )}
                >
                  {filter.label}
                </Link>
              ))}
            </nav>

            {members.items.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-stone-400">Nenhum membro {state ? "neste filtro" : "ainda"}.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-white/10 dark:border-white/10">
                {members.items.map((member) => {
                  return (
                    <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <span className="truncate font-semibold text-zinc-900 dark:text-white">{member.client.name}</span>
                          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", STATE_CLASS[member.state])}>
                            {STATE_LABEL[member.state]}
                          </span>
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-stone-300">
                          {member.planName} · {formatBRL(member.priceCents)}/mês
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-stone-400">
                          {member.state === "CANCELED"
                            ? "Adesão cancelada"
                            : `${member.usesRemaining} de ${member.usesPerMonth} usos restantes · ${member.state === "EXPIRED" ? "venceu" : "vale até"} ${formatDate(member.periodEnd)}`}
                        </p>
                      </div>
                      {member.state !== "CANCELED" ? (
                        <MemberActions
                          id={member.id}
                          clientName={member.client.name}
                          priceLabel={formatBRL(member.priceCents)}
                          canRenew={member.canRenew}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <Pagination page={members.page} pageCount={members.pageCount} pathname="/dashboard/clube" searchParams={sp} paramName="pagina" />
          </div>
        </section>
      </div>
    </div>
  );
}

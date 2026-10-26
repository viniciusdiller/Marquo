import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { ApiError } from "@/lib/api";
import { brl } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { platformFetch } from "@/lib/platform-session";
import { AUDIT_LABEL, METHOD_LABEL, ROLE_LABEL, type PlatformTenantDetail } from "@/lib/platform-api";
import { StatusBadge } from "../../StatusBadge";
import { TenantActionsMenu } from "../../TenantActionsMenu";
import { formatPhoneBR } from "@/lib/masks";
import { whatsappLink } from "@/lib/whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">{value || "—"}</dd>
    </div>
  );
}

export default async function NegocioDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let tenant: PlatformTenantDetail;
  try {
    tenant = await platformFetch<PlatformTenantDetail>(`/platform/tenants/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    throw err;
  }

  const owner = tenant.users.find((user) => user.role === "OWNER" && user.isActive);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/plataforma/negocios"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
        >
          <CaretLeft size={14} />
          Negócios
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">{tenant.name}</h1>
          <StatusBadge status={tenant.billingStatus} />
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          /{tenant.slug} · cadastrado em {formatDateTime(tenant.createdAt)}
        </p>
      </div>

      {tenant.suspendedAt ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="font-semibold text-red-700 dark:text-red-300">
            Suspenso em {formatDateTime(tenant.suspendedAt)}
          </p>
          {tenant.suspendedReason ? <p className="mt-1 text-zinc-700 dark:text-stone-200">Motivo: {tenant.suspendedReason}</p> : null}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Ações</h2>
        <div className="mt-4">
          <TenantActionsMenu
            variant="buttons"
            tenantId={tenant.id}
            tenantName={tenant.name}
            suspended={tenant.suspendedAt !== null}
            hasSubscription={tenant.subscription !== null}
            courtesy={tenant.subscription?.courtesy ?? false}
            hasActiveOwner={owner !== undefined}
            ownerPhone={owner?.phone ?? null}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 p-5 dark:border-red-500/30">
        <h2 className="font-display text-lg font-semibold text-red-700 dark:text-red-300">Excluir negócio</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-stone-300">
          Apaga clientes, agenda, comandas, financeiro, equipe e fotos. Pede o motivo e a confirmação digitada, e não há como
          desfazer. Negócio com assinatura paga em vigor não pode ser excluído.
        </p>
        <Link
          href={`/plataforma/exclusao/${tenant.id}`}
          className="mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-50 dark:text-red-300 dark:ring-red-500/40 dark:hover:bg-red-500/10"
        >
          Simular e excluir…
        </Link>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Cobrança</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Estado" value={<StatusBadge status={tenant.billingStatus} />} />
            <Field
              label="Plano"
              value={
                tenant.subscription
                  ? tenant.subscription.courtesy
                    ? `${tenant.subscription.plan.name} · cortesia${
                        tenant.subscription.currentPeriodEnd
                          ? ` até ${formatDateTime(tenant.subscription.currentPeriodEnd)}`
                          : " (sem data de fim)"
                      }`
                    : `${tenant.subscription.plan.name} · ${brl(tenant.subscription.plan.priceCents)}/mês${
                        tenant.subscription.method ? ` · ${METHOD_LABEL[tenant.subscription.method]}` : ""
                      }`
                  : "Sem assinatura"
              }
            />
            <Field label="Fim do teste" value={formatDateTime(tenant.trialEndsAt)} />
            <Field
              label="Cupom usado"
              value={
                tenant.coupon
                  ? `${tenant.coupon.code} · ${
                      tenant.coupon.kind === "TRIAL_DAYS"
                        ? `+${tenant.coupon.value} dias de teste`
                        : tenant.coupon.kind === "PERCENT"
                          ? `${tenant.coupon.value}% de desconto`
                          : `${brl(tenant.coupon.value)} de desconto`
                    }`
                  : null
              }
            />
            <Field
              label="Próxima cobrança"
              value={tenant.subscription?.currentPeriodEnd ? formatDateTime(tenant.subscription.currentPeriodEnd) : null}
            />
            <Field
              label="Cancela no fim do período"
              value={tenant.subscription ? (tenant.subscription.cancelAtPeriodEnd ? "Sim" : "Não") : null}
            />
          </dl>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Uso</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Agendamentos" value={tenant.counts.appointments} />
            <Field label="Clientes" value={tenant.counts.clients} />
            <Field label="Profissionais" value={tenant.counts.professionals} />
            <Field label="Serviços" value={tenant.counts.services} />
            <Field label="No marketplace" value={tenant.listedInMarketplace ? "Sim" : "Não"} />
            <Field label="Cidade" value={[tenant.neighborhood, tenant.city].filter(Boolean).join(", ")} />
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Contato do dono</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Nome" value={owner?.name} />
          <Field label="E-mail" value={owner?.email} />
          <Field
            label="Telefone"
            value={
              owner?.phone ? (
                <span>
                  {formatPhoneBR(owner.phone)}
                  {whatsappLink(owner.phone) ? (
                    <>
                      {" · "}
                      <a
                        href={whatsappLink(owner.phone) as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Abrir WhatsApp
                      </a>
                    </>
                  ) : null}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Não informado</span>
              )
            }
          />
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Equipe</h2>
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/5">
          {tenant.users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span>
                <span className="font-medium text-zinc-900 dark:text-white">{user.name}</span>
                <span className="ml-2 text-xs text-zinc-400">{user.email}</span>
              </span>
              <span className="text-xs text-zinc-500 dark:text-stone-400">
                {ROLE_LABEL[user.role] ?? user.role}
                {user.isActive ? "" : " · desativado"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Histórico de ações</h2>
        {tenant.audit.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-stone-400">Nenhuma ação registrada para este negócio.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/5">
            {tenant.audit.map((entry) => (
              <li key={entry.id} className="py-2.5 text-sm">
                <p className="font-medium text-zinc-900 dark:text-white">{AUDIT_LABEL[entry.action] ?? entry.action}</p>
                <p className="text-xs text-zinc-500 dark:text-stone-400">
                  {formatDateTime(entry.createdAt)} · {entry.actor}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { platformFetch } from "@/lib/platform-session";
import { DELETION_COUNT_LABEL, type PlatformDeletionPreview } from "@/lib/platform-api";
import { StatusBadge } from "../../StatusBadge";
import { DeleteTenantForm } from "./DeleteTenantForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExclusaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let preview: PlatformDeletionPreview;
  try {
    preview = await platformFetch<PlatformDeletionPreview>(`/platform/tenants/${id}/deletion-preview`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    throw err;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/plataforma/exclusao"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
        >
          <CaretLeft size={14} />
          Exclusão de dados
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">{preview.name}</h1>
          <StatusBadge status={preview.billingStatus} />
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          /{preview.slug} · cadastrado em {formatDateTime(preview.createdAt)}
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">O que será apagado</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">Simulação: nada foi alterado.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(preview.counts).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
              <dt className="text-xs text-zinc-500 dark:text-stone-400">
                {DELETION_COUNT_LABEL[key as keyof typeof DELETION_COUNT_LABEL]}
              </dt>
              <dd className="mt-0.5 text-xl font-semibold text-zinc-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-zinc-600 dark:text-stone-300">
          Também somem os arquivos enviados (logo, galeria e fotos da equipe). Ficam: o registro de pagamento (assinatura
          e cobranças), a auditoria e um esqueleto anônimo do negócio.
        </p>
      </section>

      <section className="rounded-2xl border border-red-200 p-5 dark:border-red-500/30">
        <h2 className="font-display text-lg font-semibold text-red-700 dark:text-red-300">Excluir os dados</h2>
        {preview.accessEndedAt ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-stone-300">
            Acesso terminou em {formatDateTime(preview.accessEndedAt)}.{" "}
            {preview.eligible
              ? `O prazo de ${preview.retentionDays} dias foi cumprido.`
              : `O prazo de ${preview.retentionDays} dias termina em ${formatDateTime(preview.eligibleOn)}: antes disso, só com motivo registrado.`}
          </p>
        ) : null}
        <div className="mt-5">
          {preview.deletable ? (
            <DeleteTenantForm tenantId={preview.id} slug={preview.slug} eligible={preview.eligible} />
          ) : (
            <p className="text-sm text-zinc-600 dark:text-stone-300">
              Este negócio não pode ser excluído agora (ainda tem acesso ou já foi excluído).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

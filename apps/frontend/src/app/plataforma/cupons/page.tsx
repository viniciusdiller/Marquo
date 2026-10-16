import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { brl } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { parsePageParam } from "@/lib/pagination";
import { platformFetch } from "@/lib/platform-session";
import {
  COUPON_KIND_LABEL,
  COUPON_STATE_LABEL,
  type PlatformCouponRow,
  type PlatformPage,
} from "@/lib/platform-api";
import { CouponForm } from "./CouponForm";
import { CouponToggle } from "./CouponToggle";

const PAGE_SIZE = 20;

function valueLabel(coupon: PlatformCouponRow): string {
  switch (coupon.kind) {
    case "TRIAL_DAYS":
      return `+${coupon.value} dias de teste`;
    case "PERCENT":
      return `${coupon.value}% de desconto`;
    case "FIXED_CENTS":
      return `${brl(coupon.value)} de desconto`;
  }
}

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.pagina);
  const result = await platformFetch<PlatformPage<PlatformCouponRow>>(
    `/platform/coupons?page=${page}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cupons"
        description="Códigos de campanha para novos clientes, usados no cadastro do dono."
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-zinc-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-stone-200">
        <p>
          <strong>Dias extras de teste</strong> valem na hora: o cupom soma dias ao teste de 14 dias do novo
          negócio.
        </p>
        <p className="mt-1">
          <strong>Desconto (%) e fixo (R$)</strong> ficam registrados no resgate, mas só passam a abater valor quando
          o pagamento online estiver ativo (ainda não está).
        </p>
      </div>

      <CouponForm />

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Benefício</th>
              <th className="px-4 py-3 font-medium">Usos</th>
              <th className="px-4 py-3 font-medium">Validade</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                  Nenhum cupom criado ainda.
                </td>
              </tr>
            ) : (
              result.items.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-zinc-900 dark:text-white">{coupon.code}</span>
                    {coupon.description ? <p className="text-xs text-zinc-400">{coupon.description}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                    {valueLabel(coupon)}
                    <p className="text-xs text-zinc-400">{COUPON_KIND_LABEL[coupon.kind]}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-stone-300">
                    {coupon.redemptionCount}
                    {coupon.maxRedemptions !== null ? ` / ${coupon.maxRedemptions}` : " (sem limite)"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-stone-400">
                    {coupon.validFrom ? <p>De {formatDateTime(coupon.validFrom)}</p> : null}
                    {coupon.validUntil ? <p>Até {formatDateTime(coupon.validUntil)}</p> : null}
                    {!coupon.validFrom && !coupon.validUntil ? "Sem prazo" : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-stone-200">{COUPON_STATE_LABEL[coupon.state]}</td>
                  <td className="px-4 py-3 text-right">
                    <CouponToggle couponId={coupon.id} code={coupon.code} isActive={coupon.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} pageCount={result.pageCount} pathname="/plataforma/cupons" searchParams={params} />
    </div>
  );
}

import { PageHeader } from "@/components/ui/PageHeader";
import { platformFetch } from "@/lib/platform-session";
import type { PlatformPlanPrice } from "@/lib/platform-api";
import { PlanPriceEditor } from "./PlanPriceEditor";

export default async function PrecosPage() {
  const plans = await platformFetch<PlatformPlanPrice[]>("/platform/plans");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Preços dos planos"
        description="Altere o preço mensal de cada plano, para menos ou para mais. O novo valor vale para quem assinar, trocar de plano ou pagar o próximo Pix depois de salvar. Tudo fica na auditoria."
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Quem já assina no cartão continua pagando o valor combinado com o Mercado Pago: a recorrência não é alterada por aqui.
        Esses assinantes só pagam o preço novo se trocarem de plano (vale também para aumentos).
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanPriceEditor key={plan.tier} plan={plan} />
        ))}
      </div>
    </div>
  );
}

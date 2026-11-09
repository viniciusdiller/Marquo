import type { MarketplaceSettings as Settings, OwnerReview } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { MarketplaceSettings } from "./MarketplaceSettings";
import { ReviewsModeration } from "./ReviewsModeration";

export default async function MarketplacePage() {
  const session = await auth();
  requireRole(session, ["OWNER"]);

  const [settings, reviews] = await Promise.all([
    authedFetch<Settings>("/tenants/me/marketplace"),
    authedFetch<OwnerReview[]>("/reviews").catch(() => []),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Marketplace"
        description="Apareça no portal de descoberta e modere as avaliações dos clientes."
      />

      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <HowItWorks>
            <p>
              O catálogo de estabelecimentos é o portal público do Marquo onde pessoas
              <strong> procuram barbearias e salões por serviço, cidade ou bairro</strong>. Ao ativar a visibilidade,
              seu negócio passa a ser recomendado para novos clientes na sua região.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Vem <strong>desligado</strong> por padrão e não gera comissões nem cobranças extras no seu plano.</li>
              <li>Preencha cidade, bairro, endereço, categorias e faixa de preço para aparecer bem posicionado nas buscas.</li>
              <li>Em <strong>Avaliações</strong> você acompanha o que os clientes escreveram e pode moderar os comentários públicos.</li>
            </ul>
          </HowItWorks>

          <section>
            <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-white">Visibilidade e informações do salão</h2>
            <MarketplaceSettings settings={settings} />
          </section>
        </div>

        <div className="flex min-w-0 flex-col">
          <section>
            <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-white">Avaliações</h2>
            <ReviewsModeration reviews={reviews} />
          </section>
        </div>
      </div>
    </div>
  );
}

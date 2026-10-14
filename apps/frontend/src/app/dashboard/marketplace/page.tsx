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
              O marketplace (<code>/descobrir</code>) é um portal público onde pessoas
              <strong> procuram salões por serviço, cidade ou bairro</strong>. Se você ativar,
              seu negócio aparece nos resultados.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Vem <strong>desligado</strong> por padrão e não afeta plano nem cobrança.</li>
              <li>Preencha cidade, bairro, categorias e faixa de preço para ser encontrado nas buscas.</li>
              <li>Em <strong>Avaliações</strong> você vê o que os clientes escreveram. Pode <strong>ocultar</strong> (some da página pública; hoje não dá para reexibir) ou <strong>denunciar</strong> com um motivo.</li>
            </ul>
          </HowItWorks>

          <section>
            <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-white">Listagem</h2>
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

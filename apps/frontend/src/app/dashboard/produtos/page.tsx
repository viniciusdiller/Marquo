import type { AdminProduct } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { ProductsManager } from "./ProductsManager";

export default async function ProdutosPage() {
  const session = await auth();
  requireRole(session, ["OWNER", "RECEPTIONIST"]);

  const products = await authedFetch<AdminProduct[]>("/products?includeInactive=true").catch(
    () => [],
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Produtos"
        description="Catálogo e estoque. O saldo baixa automaticamente ao fechar uma comanda com produto."
      />
      <ProductsManager products={products}>
        <HowItWorks>
          <p>
            Aqui ficam os itens que você <strong>vende no balcão</strong> (pomada, shampoo,
            etc.), com preço e quantidade em estoque.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Preço de venda</strong> é o que o cliente paga. <strong>Custo</strong> é o que você pagou; ele ajuda a calcular o lucro no Financeiro.</li>
            <li>Ao <strong>fechar uma comanda</strong> com o produto, o estoque baixa sozinho.</li>
            <li>Em <strong>Movimentar</strong>, use <em>+ entrada</em> quando comprar mais e <em>− saída</em> para perda ou uso interno.</li>
            <li>Produto desativado some das comandas novas, mas o histórico fica.</li>
          </ul>
        </HowItWorks>
      </ProductsManager>
    </div>
  );
}

import type { CashRegisterSummary } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { CaixaView } from "./CaixaView";

export default async function CaixaPage() {
  const session = await auth();
  requireRole(session, ["OWNER", "RECEPTIONIST"]);

  const summary = await authedFetch<CashRegisterSummary>("/cash-register").catch(
    () => ({ open: false }) as CashRegisterSummary,
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Caixa"
        description="Abertura com fundo de troco, sangria/suprimento e fechamento com conferência."
      />
      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <HowItWorks>
            <p>
              O caixa controla o <strong>dinheiro físico</strong> da gaveta no dia. Só pagamentos
              em dinheiro entram na conta; Pix e cartão não.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li><strong>Abrir:</strong> informe o fundo de troco, o dinheiro que já está na gaveta de manhã.</li>
              <li><strong>Sangria:</strong> você tirou dinheiro da gaveta (levou ao banco, pagou um fornecedor); não pode ser maior que o dinheiro que está lá. <strong>Suprimento:</strong> você colocou mais troco.</li>
              <li><strong>Fechar:</strong> conte o dinheiro que está na gaveta e informe. O sistema compara com o esperado (fundo + pagamentos em dinheiro + suprimentos − sangrias) e mostra a diferença.</li>
            </ol>
            <p>Fechar o caixa não tem volta: depois não dá para reabrir nem editar os lançamentos.</p>
          </HowItWorks>
        </div>
        <div className="flex min-w-0 flex-col">
          <CaixaView summary={summary} />
        </div>
      </div>
    </div>
  );
}

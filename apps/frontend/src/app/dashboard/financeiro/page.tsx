import type {
  FinanceOverview,
  FinancialCategory,
  FinancialEntry,
} from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { FinanceView } from "./FinanceView";

export default async function FinanceiroPage() {
  const session = await auth();
  requireRole(session, ["OWNER", "RECEPTIONIST"]);

  const [overview, entries, categories] = await Promise.all([
    authedFetch<FinanceOverview>("/finance/overview").catch(
      () =>
        ({
          receivableCents: 0,
          receivableOverdueCents: 0,
          payableCents: 0,
          payableOverdueCents: 0,
          monthIncomeCents: 0,
          monthExpenseCents: 0,
          monthNetCents: 0,
        }) as FinanceOverview,
    ),
    authedFetch<FinancialEntry[]>("/finance/entries").catch(() => []),
    authedFetch<FinancialCategory[]>("/finance/categories").catch(() => []),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Financeiro"
        description="Receitas das comandas entram automáticas. Despesas e contas a pagar você lança aqui."
      />
      <HowItWorks>
        <p>
          O Financeiro junta tudo o que <strong>entra e sai</strong> do negócio. As receitas
          das comandas fechadas entram sozinhas; despesas e outras contas você lança aqui.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Os quatro quadros no topo: quanto <strong>há a receber</strong>, quanto <strong>há a pagar</strong> (com o que já venceu em destaque), o que <strong>entrou no mês</strong> e o <strong>resultado do mês</strong> (entrou menos saiu).</li>
          <li><strong>Lançamentos:</strong> cadastre uma despesa ou receita com valor e vencimento. Marque “Já quitado” se já foi paga; senão ela fica pendente até você dar baixa.</li>
          <li><strong>A pagar / A receber:</strong> só o que ainda está pendente. “Dar baixa” marca como pago.</li>
          <li><strong>Fluxo de caixa:</strong> o que realmente entrou e saiu num período.</li>
          <li><strong>DRE</strong> (só o dono): receita menos custo dos produtos vendidos (CMV) e despesas, que dá o lucro.</li>
        </ul>
      </HowItWorks>
      <FinanceView
        overview={overview}
        entries={entries}
        categories={categories}
        role={session.user.role}
      />
    </div>
  );
}

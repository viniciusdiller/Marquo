import type { AdminProduct, CommissionRule, EarningsReport } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { resolvePeriod } from "@/lib/earnings-period";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { ComissoesView } from "./ComissoesView";
import { EarningsSection } from "./EarningsSection";

interface CatalogService {
  id: string;
  name: string;
}
interface TeamMember {
  id: string;
  user: { name: string };
}

// searchParams chega como string | string[] | undefined; só aceitamos string (o resto é lixo da URL).
const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string | string[]; de?: string | string[]; ate?: string | string[] }>;
}) {
  const session = await auth();
  requireRole(session, ["OWNER"]);

  const query = await searchParams;
  const period = resolvePeriod({ periodo: first(query.periodo), de: first(query.de), ate: first(query.ate) });
  const earningsQuery = new URLSearchParams({ from: period.from, to: period.to });

  const [report, rules, team, services, products] = await Promise.all([
    authedFetch<EarningsReport>(`/commissions/earnings?${earningsQuery.toString()}`).catch(() => null),
    authedFetch<CommissionRule[]>("/commissions/rules").catch(() => []),
    authedFetch<TeamMember[]>("/professionals").catch(() => []),
    authedFetch<CatalogService[]>("/services").catch(() => []),
    authedFetch<AdminProduct[]>("/products").catch(() => []),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Comissões e repasses"
        description="Quanto cada profissional faturou e quanto você precisa repassar. Atualizado a cada comanda fechada."
      />

      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <HowItWorks>
            <p>
              A tabela é calculada na hora, sem fechar período. Uma comanda entra nos números
              quando é <strong>fechada</strong>, no período escolhido.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Bruto:</strong> soma do preço dos serviços e produtos atendidos por ele, antes de qualquer desconto.</li>
              <li><strong>Descontos:</strong> a parte do desconto de cada comanda que cabe a ele, dividida proporcionalmente ao valor dos itens.</li>
              <li><strong>Líquido:</strong> bruto menos descontos, o que o cliente de fato pagou pelo trabalho dele.</li>
              <li><strong>Repasse:</strong> a comissão dele no período, pelas regras abaixo. Ela é calculada sobre o <strong>bruto</strong>, então o desconto sai do lado da casa.</li>
              <li><strong>Sobra da casa:</strong> líquido menos repasse.</li>
              <li><strong>A repassar:</strong> saldo acumulado de todo o histórico que ainda não foi pago (não depende do período). <strong>Registrar repasse</strong> lança uma despesa já paga em Financeiro e baixa o saldo; pode ser parcial.</li>
              <li>Itens sem profissional na comanda não aparecem aqui.</li>
            </ul>
          </HowItWorks>

          <div className="min-w-0">
            <ComissoesView
              rules={rules}
              professionals={team.map((t) => ({ id: t.id, name: t.user.name }))}
              services={services}
              products={products.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        </div>
        
        <div className="flex min-w-0 flex-col">
          <EarningsSection report={report} period={period} />
        </div>
      </div>
    </div>
  );
}

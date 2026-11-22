import type { AdminProduct, CommissionRule, EarningsReport } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access-server";
import { canAccess, ownEarningsOnly } from "@/lib/access";
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
  const access = await getAccess();
  // Profissional sem a área: só os PRÓPRIOS ganhos (o backend força o filtro pelo token). Qualquer outro sem a área volta.
  const selfOnly = ownEarningsOnly(access);
  if (!selfOnly && !canAccess(access, "comissoes")) redirect("/dashboard");
  const canEditRules = canAccess(access, "comissoes", "EDIT");

  const query = await searchParams;
  const period = resolvePeriod({ periodo: first(query.periodo), de: first(query.de), ate: first(query.ate) });
  const earningsQuery = new URLSearchParams({ from: period.from, to: period.to });

  if (selfOnly) {
    const report = await authedFetch<EarningsReport>(`/commissions/earnings?${earningsQuery.toString()}`).catch(() => null);
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader
          title="Meus ganhos"
          description="Quanto você faturou e a sua comissão no período. Atualizado a cada comanda fechada."
        />
        <div className="mt-6 flex flex-col gap-6">
          <HowItWorks>
            <ul className="list-disc space-y-1 pl-5">
              <li>Entram aqui as comandas <strong>fechadas</strong> no período com itens atendidos por você.</li>
              <li><strong>Bruto:</strong> soma do preço dos seus serviços e produtos, antes de descontos.</li>
              <li><strong>Líquido:</strong> bruto menos a sua parte dos descontos dados nas comandas.</li>
              <li><strong>Minha comissão:</strong> o que você ganhou no período pelas regras definidas pelo dono.</li>
              <li><strong>A receber:</strong> comissões de todo o histórico que ainda não foram repassadas a você.</li>
            </ul>
          </HowItWorks>
          <EarningsSection report={report} period={period} canPayout={false} selfOnly />
        </div>
      </div>
    );
  }

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

          {canEditRules ? (
          <div className="min-w-0">
            <ComissoesView
              rules={rules}
              professionals={team.map((t) => ({ id: t.id, name: t.user.name }))}
              services={services}
              products={products.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
          ) : null}
        </div>
        
        <div className="flex min-w-0 flex-col">
          <EarningsSection report={report} period={period} canPayout={canAccess(access, "financeiro_avancado", "EDIT")} />
        </div>
      </div>
    </div>
  );
}

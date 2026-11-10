// Cobertura do clube numa comanda: quais serviços saem sem cobrança. Função PURA (sem banco), para ser testada à exaustão:
// é a regra que mexe no total da comanda, na receita e no saldo de usos do cliente.

export interface CoverageItem {
  id: string;
  kind: string;
  serviceId: string | null;
  quantity: number;
  unitPriceCents: number;
  createdAt: Date;
}

export interface CoverageLine {
  itemId: string;
  units: number;
  coveredCents: number;
}

export interface Coverage {
  coveredCents: number;
  lines: CoverageLine[];
}

export const NO_COVERAGE: Coverage = { coveredCents: 0, lines: [] };

// Cada UNIDADE de serviço do pacote gasta 1 uso. Os itens entram na ordem em que foram lançados na comanda (createdAt, depois
// id para desempate estável), até acabar o saldo. Item avulso, produto e serviço fora do pacote nunca são cobertos.
export function computeCoverage(
  items: CoverageItem[],
  eligibleServiceIds: ReadonlySet<string>,
  remainingUses: number,
): Coverage {
  let remaining = Math.max(0, Math.trunc(remainingUses));
  if (remaining === 0) return NO_COVERAGE;

  const eligible = items
    .filter((item) => item.kind === "SERVICE" && item.serviceId !== null && eligibleServiceIds.has(item.serviceId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

  const lines: CoverageLine[] = [];
  let coveredCents = 0;
  for (const item of eligible) {
    if (remaining === 0) break;
    const units = Math.min(Math.max(0, Math.trunc(item.quantity)), remaining);
    if (units === 0) continue;
    const cents = units * item.unitPriceCents;
    lines.push({ itemId: item.id, units, coveredCents: cents });
    coveredCents += cents;
    remaining -= units;
  }
  return { coveredCents, lines };
}

import { readFileSync } from "fs";
import { join } from "path";
import { PURGE_STEPS, RETAINED_TENANT_MODELS } from "./tenant-deletion.service";

// Guarda contra o esquecimento: quem criar uma tabela nova com `tenantId` e não a incluir na exclusão deixaria dado de
// cliente para trás (um furo de LGPD silencioso). Este teste lê o schema do Prisma e exige que TODA tabela com tenantId
// esteja na limpeza (PURGE_STEPS) ou na lista de mantidas de propósito (RETAINED_TENANT_MODELS).
const SCHEMA = readFileSync(join(__dirname, "../../../../packages/database/prisma/schema.prisma"), "utf8");

function modelsWithTenantId(): string[] {
  const models: string[] = [];
  for (const match of SCHEMA.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/^\s+tenantId\s+String\b/m.test(match[2])) models.push(match[1]);
  }
  return models;
}

describe("exclusão de dados: cobertura do schema", () => {
  const purged = PURGE_STEPS.map((step) => step.model);

  it("toda tabela com tenantId é apagada OU está na lista de mantidas de propósito", () => {
    const uncovered = modelsWithTenantId().filter((model) => !purged.includes(model) && !RETAINED_TENANT_MODELS.includes(model));
    expect(uncovered).toEqual([]);
  });

  it("não há tabela apagada e mantida ao mesmo tempo", () => {
    expect(purged.filter((model) => RETAINED_TENANT_MODELS.includes(model))).toEqual([]);
  });

  it("todos os modelos citados existem no schema (nome errado seria um passo que nunca roda)", () => {
    const withTenantId = modelsWithTenantId();
    for (const model of [...purged, ...RETAINED_TENANT_MODELS]) expect(withTenantId).toContain(model);
  });

  it("o registro de pagamento fica: assinatura, cobranças e cupom NÃO são apagados", () => {
    for (const model of ["Subscription", "BillingAttempt", "CouponRedemption"]) {
      expect(purged).not.toContain(model);
      expect(RETAINED_TENANT_MODELS).toContain(model);
    }
  });

  // Ordem por chave RESTRICT (o filho tem de sair antes do pai). Conferido no Postgres; este teste a trava.
  it("respeita a ordem das chaves RESTRICT do banco", () => {
    const before = (child: string, parent: string) => expect(purged.indexOf(child)).toBeLessThan(purged.indexOf(parent));
    before("CommissionPayout", "FinancialEntry");
    before("CommissionPayout", "Professional");
    before("CommissionEntry", "Professional");
    before("StockMovement", "Product");
    before("Appointment", "Service");
    before("Appointment", "Professional");
    for (const child of ["Ticket", "CashRegister", "FinancialEntry", "CommissionPayout"]) before(child, "User");
  });
});

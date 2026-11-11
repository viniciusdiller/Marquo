import "reflect-metadata";
import { FinanceController } from "./finance.controller";
import { areaOf, rolesOf } from "../access/area-metadata";

const proto = FinanceController.prototype;

// Financeiro tem DUAS áreas nos perfis: "financeiro" (lançamentos, contas e fluxo de caixa) e "financeiro_avancado" (DRE, categorias e
// repasse de comissões, que antes eram só do dono). Assim a recepção continua como era, e o dono pode liberar o avançado a quem quiser.
describe("FinanceController: quem pode chamar o quê", () => {
  it.each(["createCategory", "updateCategory", "registerPayout", "listPayouts", "dre"] as const)(
    "%s pertence à área financeiro_avancado",
    (handler) => {
      expect(areaOf(FinanceController, handler)).toMatchObject({ area: "financeiro_avancado" });
      expect(rolesOf(FinanceController, handler)).toBeUndefined();
    },
  );

  it.each(["overview", "listCategories", "listEntries", "createEntry", "updateEntry", "settleEntry", "cancelEntry", "cashFlow", "payables", "receivables"] as const)(
    "%s pertence à área financeiro (herda da classe)",
    (handler) => {
      expect(areaOf(FinanceController, handler)).toMatchObject({ area: "financeiro" });
      expect(rolesOf(FinanceController, handler)).toBeUndefined();
    },
  );

  // Dinheiro saindo: além do limite global (100/min), o repasse tem teto próprio por minuto.
  it("registerPayout tem limite de requisições próprio (20/min)", () => {
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", proto.registerPayout)).toBe(20);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", proto.registerPayout)).toBe(60_000);
  });
});

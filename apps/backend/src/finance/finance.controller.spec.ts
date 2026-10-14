import "reflect-metadata";
import { Role } from "@marquo/database";
import { FinanceController } from "./finance.controller";
import { ROLES_KEY } from "../common/decorators/roles.decorator";

const proto = FinanceController.prototype;
const methodRoles = (handler: keyof FinanceController) => Reflect.getMetadata(ROLES_KEY, proto[handler]);

describe("FinanceController: quem pode chamar o quê", () => {
  it("a classe toda exige OWNER ou RECEPTIONIST (PROFESSIONAL não acessa financeiro)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, FinanceController)).toEqual([Role.OWNER, Role.RECEPTIONIST]);
  });

  it.each(["createCategory", "updateCategory", "registerPayout", "listPayouts", "dre"] as const)(
    "%s restringe além da classe: só OWNER",
    (handler) => {
      expect(methodRoles(handler)).toEqual([Role.OWNER]);
    },
  );

  it.each(["overview", "listCategories", "listEntries", "createEntry", "updateEntry", "settleEntry", "cancelEntry", "cashFlow", "payables", "receivables"] as const)(
    "%s não restringe no handler — herda OWNER+RECEPTIONIST da classe",
    (handler) => {
      expect(methodRoles(handler)).toBeUndefined();
    },
  );

  // Dinheiro saindo: além do limite global (100/min), o repasse tem teto próprio por minuto.
  it("registerPayout tem limite de requisições próprio (20/min)", () => {
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", proto.registerPayout)).toBe(20);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", proto.registerPayout)).toBe(60_000);
  });
});

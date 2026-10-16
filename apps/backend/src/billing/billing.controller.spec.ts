import "reflect-metadata";
import { BillingController } from "./billing.controller";
import { SKIP_BILLING_CHECK_KEY } from "../common/decorators/skip-billing-check.decorator";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";
import { ROLES_KEY } from "../common/decorators/roles.decorator";

const proto = BillingController.prototype;
const meta = (key: string, handler: keyof BillingController) => Reflect.getMetadata(key, proto[handler]);

describe("BillingController: quem pode chamar o quê", () => {
  it("apenas GET /plans é público", () => {
    expect(meta(IS_PUBLIC_KEY, "listPlans")).toBe(true);
    expect(meta(IS_PUBLIC_KEY, "getStatus")).toBeUndefined();
  });

  // O dashboard descobre por aqui que o acesso está bloqueado (trial vencido, suspensão, cortesia
  // vencida): precisa responder mesmo bloqueado, para qualquer papel de staff logado.
  it("/billing/status exige login, funciona com o acesso bloqueado e não exige OWNER", () => {
    expect(meta(SKIP_BILLING_CHECK_KEY, "getStatus")).toBe(true);
    expect(meta(ROLES_KEY, "getStatus")).toBeUndefined();
  });

  it("não existe mais rota de checkout, portal nem troca de plano (sem provedor de pagamento)", () => {
    const handlers = Object.getOwnPropertyNames(proto).filter((name) => name !== "constructor");
    expect(handlers.sort()).toEqual(["getStatus", "listPlans"]);
  });
});

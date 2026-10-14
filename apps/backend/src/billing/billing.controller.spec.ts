import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Role } from "@marquo/database";
import { BillingController } from "./billing.controller";
import { ChangePlanDto, CreateCheckoutDto, PreviewChangePlanQueryDto } from "./dto/billing.dto";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { SKIP_BILLING_CHECK_KEY } from "../common/decorators/skip-billing-check.decorator";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator";

const proto = BillingController.prototype;
const meta = (key: string, handler: keyof BillingController) => Reflect.getMetadata(key, proto[handler]);
const validateOpts = { whitelist: true, forbidNonWhitelisted: true };

describe("BillingController: quem pode chamar o quê", () => {
  // Cobrança e troca de plano são do DONO. Recepção e profissional não abrem checkout nem portal.
  it.each(["createCheckout", "createPortal", "previewChangePlan", "changePlan"] as const)(
    "%s exige OWNER, funciona com o acesso bloqueado e tem limite próprio",
    (handler) => {
      expect(meta(ROLES_KEY, handler)).toEqual([Role.OWNER]);
      // Quem está com o trial vencido ou a assinatura cancelada precisa justamente destas rotas.
      expect(meta(SKIP_BILLING_CHECK_KEY, handler)).toBe(true);
      // Chamadas ao Stripe custam dinheiro/latência: limite bem abaixo do global de 100/min.
      expect(Reflect.getMetadataKeys(proto[handler]).some((k: string) => k.startsWith("THROTTLER:LIMIT"))).toBe(true);
    },
  );

  it("apenas GET /plans é público; /billing/status não exige OWNER mas exige login", () => {
    expect(meta(IS_PUBLIC_KEY, "listPlans")).toBe(true);
    expect(meta(IS_PUBLIC_KEY, "getStatus")).toBeUndefined();
    expect(meta(ROLES_KEY, "getStatus")).toBeUndefined();
    for (const handler of ["createCheckout", "createPortal", "previewChangePlan", "changePlan"] as const) {
      expect(meta(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
  });
});

describe("DTOs de cobrança (fronteira)", () => {
  const errorsFor = async (cls: new () => object, plain: object) => validate(plainToInstance(cls, plain), validateOpts);

  // Confiança no cliente: nenhum campo de valor existe. Preço, Price do Stripe, tenant e customer
  // são sempre derivados no servidor, então qualquer um deles no body é rejeitado.
  it.each(["priceId", "price", "amount", "unitPriceCents", "tenantId", "customerId", "stripeCustomerId", "successUrl"])(
    "CreateCheckoutDto rejeita o campo '%s' enviado pelo cliente",
    async (field) => {
      const errors = await errorsFor(CreateCheckoutDto, { tier: "PREMIUM", [field]: "x" });
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );

  it("CreateCheckoutDto e a query do preview só aceitam um tier válido", async () => {
    expect(await errorsFor(CreateCheckoutDto, { tier: "PREMIUM" })).toHaveLength(0);
    for (const bad of [{}, { tier: "premium" }, { tier: "GRATIS" }, { tier: 1 }]) {
      expect((await errorsFor(CreateCheckoutDto, bad)).length).toBeGreaterThan(0);
      expect((await errorsFor(PreviewChangePlanQueryDto, bad)).length).toBeGreaterThan(0);
    }
    expect(await errorsFor(PreviewChangePlanQueryDto, { tier: "ESSENCIAL" })).toHaveLength(0);
  });

  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("ChangePlanDto: ids opcionais, únicos, UUID v4 e no máximo 50", async () => {
    expect(await errorsFor(ChangePlanDto, { tier: "ESSENCIAL" })).toHaveLength(0);
    expect(await errorsFor(ChangePlanDto, { tier: "ESSENCIAL", deactivateProfessionalIds: [uuid(1), uuid(2)] })).toHaveLength(0);

    const bad: object[] = [
      { tier: "ESSENCIAL", deactivateProfessionalIds: [uuid(1), uuid(1)] }, // repetido
      { tier: "ESSENCIAL", deactivateProfessionalIds: ["1 OR 1=1"] }, // não é UUID
      { tier: "ESSENCIAL", deactivateProfessionalIds: "prof-1" }, // não é lista
      { tier: "ESSENCIAL", deactivateProfessionalIds: Array.from({ length: 51 }, (_, i) => uuid(i + 1)) },
      { tier: "ESSENCIAL", deactivateProfessionalIds: [uuid(1)], tenantId: "outro" }, // campo extra
    ];
    for (const plain of bad) {
      expect((await errorsFor(ChangePlanDto, plain)).length).toBeGreaterThan(0);
    }
  });
});

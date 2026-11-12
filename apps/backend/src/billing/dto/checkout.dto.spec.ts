import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangePlanDto, CheckoutDto, StartCheckoutDto } from "./checkout.dto";

const errorsOf = async (cls: new () => object, data: object) =>
  (await validate(plainToInstance(cls, data), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

describe("StartCheckoutDto (cartão e Pix)", () => {
  const ok = { tier: "PROFISSIONAL" };

  it("aceita CPF e CNPJ, com ou sem máscara", async () => {
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "529.982.247-25" })).toEqual([]);
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "52998224725" })).toEqual([]);
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "11.222.333/0001-81" })).toEqual([]);
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "  52998224725  " })).toEqual([]);
  });

  it("o documento é opcional no corpo (vem do cadastro salvo), mas se vier precisa ter dígitos verificadores certos", async () => {
    expect(await errorsOf(StartCheckoutDto, ok)).toEqual([]);
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "529.982.247-26" })).toContain("cpfCnpj");
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "11.222.333/0001-82" })).toContain("cpfCnpj");
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "111.111.111-11" })).toContain("cpfCnpj");
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: 52998224725 })).toContain("cpfCnpj");
    expect(await errorsOf(StartCheckoutDto, { ...ok, cpfCnpj: "5".repeat(500) })).toContain("cpfCnpj");
  });

  it("aceita telefone, CEP e endereço do pagador e recusa lixo", async () => {
    const address = { phone: "(11) 91234-5678", postalCode: "01310-100", address: "Av. Paulista", addressNumber: "1000", complement: "Sala 2", province: "Bela Vista" };
    expect(await errorsOf(StartCheckoutDto, { ...ok, ...address })).toEqual([]);
    expect(await errorsOf(StartCheckoutDto, { ...ok, phone: "123" })).toContain("phone");
    expect(await errorsOf(StartCheckoutDto, { ...ok, postalCode: "123" })).toContain("postalCode");
    expect(await errorsOf(StartCheckoutDto, { ...ok, postalCode: "abcde-fgh" })).toContain("postalCode");
    expect(await errorsOf(StartCheckoutDto, { ...ok, address: "x".repeat(121) })).toContain("address");
    expect(await errorsOf(StartCheckoutDto, { ...ok, addressNumber: "9".repeat(21) })).toContain("addressNumber");
    expect(await errorsOf(StartCheckoutDto, { ...ok, province: 5 })).toContain("province");
  });

  // Confiança no cliente: nenhum campo de valor existe; o forbidNonWhitelisted global devolve 400.
  it("recusa campo de valor, e-mail do pagador ou tenant vindos do cliente", async () => {
    const base = { ...ok, cpfCnpj: "52998224725" };
    for (const extra of [{ amountCents: 1 }, { chargeCents: 1 }, { value: 1 }, { email: "x@y.com" }, { tenantId: "t" }, { method: "PIX" }]) {
      expect(await errorsOf(StartCheckoutDto, { ...base, ...extra })).not.toEqual([]);
    }
  });

  it("plano inválido é recusado", async () => {
    expect(await errorsOf(StartCheckoutDto, { tier: "GRATIS", cpfCnpj: "52998224725" })).toContain("tier");
  });
});

describe("CheckoutDto (cotação) e ChangePlanDto", () => {
  it("a cotação não pede documento", async () => {
    expect(await errorsOf(CheckoutDto, { tier: "PREMIUM" })).toEqual([]);
    expect(await errorsOf(CheckoutDto, { tier: "PREMIUM", couponCode: "PROMO20" })).toEqual([]);
  });

  it("troca de plano aceita só o plano, mais (opcional) o documento de quem paga a diferença", async () => {
    expect(await errorsOf(ChangePlanDto, { tier: "ESSENCIAL" })).toEqual([]);
    expect(await errorsOf(ChangePlanDto, { tier: "PREMIUM", cpfCnpj: "52998224725" })).toEqual([]);
    expect(await errorsOf(ChangePlanDto, { tier: "PREMIUM", cpfCnpj: "123" })).toContain("cpfCnpj");
  });

  // Nenhum valor, desconto ou data da diferença do upgrade pode vir do cliente.
  it("troca de plano recusa qualquer campo de valor, data ou plano de origem vindo do cliente", async () => {
    for (const extra of [{ amountCents: 1 }, { chargeCents: 1 }, { value: 1 }, { fromPlanId: "x" }, { periodEnd: "2026-12-01" }, { remainingDays: 1 }, { tenantId: "t" }]) {
      expect(await errorsOf(ChangePlanDto, { tier: "PREMIUM", ...extra })).not.toEqual([]);
    }
  });
});

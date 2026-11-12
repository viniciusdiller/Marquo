import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { FieldCryptoService } from "../../common/crypto/field-crypto.service";
import { BillingProfileService } from "./billing-profile.service";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = "ab".repeat(32);

const FULL = {
  cpfCnpj: "529.982.247-25",
  phone: "(11) 91234-5678",
  postalCode: "01310-100",
  address: "  Av.   Paulista ",
  addressNumber: "1000",
  province: "Bela Vista",
};

function build(opts: { key?: string; ownerPhone?: string | null } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    tenantBillingProfile: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { tenantId: string } }) => rows.get(where.tenantId) ?? null),
      upsert: jest.fn().mockImplementation(async ({ where, create, update }) => {
        const next = { ...(rows.get(where.tenantId) ?? create), ...update };
        rows.set(where.tenantId, next);
        return next;
      }),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ phone: opts.ownerPhone ?? null }) },
  } as unknown as PrismaService;
  const config = { get: () => (opts.key === undefined ? KEY : opts.key) } as unknown as ConfigService;
  return { service: new BillingProfileService(prisma, new FieldCryptoService(config)), prisma, rows };
}

describe("BillingProfileService.resolve", () => {
  it("cartão: valida, normaliza e grava; o CPF vai CRIPTOGRAFADO, nunca em claro", async () => {
    const { service, rows } = build();
    const payer = await service.resolve(TENANT, USER, FULL, true);

    expect(payer).toMatchObject({
      document: "52998224725",
      phone: "11912345678",
      postalCode: "01310100",
      address: "Av. Paulista",
      addressNumber: "1000",
      province: "Bela Vista",
    });
    const saved = rows.get(TENANT) as Record<string, string>;
    expect(JSON.stringify(saved)).not.toContain("52998224725");
    expect(saved.documentEnc.startsWith("v1:")).toBe(true);
    expect(saved.documentHint).toBe("***.***.***-25");
    expect(saved.postalCode).toBe("01310100");
  });

  it("reaproveita o cadastro salvo: na segunda vez basta o plano (nada digitado)", async () => {
    const { service } = build();
    await service.resolve(TENANT, USER, FULL, true);
    const again = await service.resolve(TENANT, USER, {}, true);
    expect(again).toMatchObject({ document: "52998224725", phone: "11912345678", postalCode: "01310100", province: "Bela Vista" });
  });

  it("usa o telefone do dono quando o cadastro de cobrança não tem", async () => {
    const { service } = build({ ownerPhone: "11987654321" });
    const payer = await service.resolve(TENANT, USER, { ...FULL, phone: undefined }, true);
    expect(payer.phone).toBe("11987654321");
  });

  it("cartão com dado faltando: 400 que diz o que preencher, e nada é gravado", async () => {
    const { service, prisma } = build();
    await expect(service.resolve(TENANT, USER, { cpfCnpj: FULL.cpfCnpj }, true)).rejects.toThrow(
      /telefone, CEP, rua, número, bairro/,
    );
    expect(prisma.tenantBillingProfile.upsert).not.toHaveBeenCalled();
  });

  it("Pix só exige o documento", async () => {
    const { service } = build();
    const payer = await service.resolve(TENANT, USER, { cpfCnpj: FULL.cpfCnpj }, false);
    expect(payer.document).toBe("52998224725");
    await expect(build().service.resolve(TENANT, USER, {}, false)).rejects.toThrow(/CPF ou CNPJ/);
  });

  it.each([
    ["CPF inválido", { cpfCnpj: "529.982.247-26" }, /CPF ou CNPJ inválido/],
    ["telefone inválido", { phone: "123" }, /Telefone inválido/],
    ["CEP curto", { postalCode: "1234" }, /CEP inválido/],
  ])("entrada inválida (%s) é recusada antes de gravar", async (_l, patch, message) => {
    const { service, prisma } = build();
    await expect(service.resolve(TENANT, USER, { ...FULL, ...patch }, true)).rejects.toThrow(message);
    expect(prisma.tenantBillingProfile.upsert).not.toHaveBeenCalled();
  });

  it("sem DATA_ENCRYPTION_KEY o documento NÃO é gravado (nunca em claro) e é pedido de novo", async () => {
    const { service, rows } = build({ key: "" });
    await service.resolve(TENANT, USER, FULL, true);
    const saved = rows.get(TENANT) as Record<string, unknown>;
    expect(saved.documentEnc).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain("52998224725");
    await expect(service.resolve(TENANT, USER, { ...FULL, cpfCnpj: undefined }, true)).rejects.toThrow(/CPF ou CNPJ/);
  });

  // IDOR: o cadastro é sempre lido pelo tenant do JWT; o de outro negócio não aparece.
  it("não enxerga o cadastro de outro negócio", async () => {
    const { service } = build();
    await service.resolve(OTHER_TENANT, USER, FULL, true);
    await expect(service.resolve(TENANT, USER, {}, true)).rejects.toThrow(BadRequestException);
  });

  it("documento ilegível (chave trocada) é pedido de novo, sem lançar erro interno", async () => {
    const { service, rows } = build();
    await service.resolve(TENANT, USER, FULL, true);
    (rows.get(TENANT) as Record<string, string>).documentEnc = "v1:AAAA:BBBB:CCCC";
    await expect(service.resolve(TENANT, USER, { ...FULL, cpfCnpj: undefined }, true)).rejects.toThrow(/CPF ou CNPJ/);
  });
});

describe("BillingProfileService.view / resolveDocument", () => {
  it("devolve só a máscara do documento, nunca o número inteiro nem o texto cifrado", async () => {
    const { service } = build();
    await service.resolve(TENANT, USER, FULL, true);
    const view = await service.view(TENANT, USER);
    expect(view.documentHint).toBe("***.***.***-25");
    expect(view.missingForCard).toEqual([]);
    expect(view.canStoreDocument).toBe(true);
    const json = JSON.stringify(view);
    expect(json).not.toContain("52998224725");
    expect(json).not.toContain("v1:");
  });

  it("lista o que falta para cartão e Pix quando não há cadastro", async () => {
    const { service } = build();
    const view = await service.view(TENANT, USER);
    expect(view.missingForPix).toEqual(["cpfCnpj"]);
    expect(view.missingForCard).toEqual(["cpfCnpj", "phone", "postalCode", "address", "addressNumber", "province"]);
  });

  it("resolveDocument: usa o digitado (e grava) ou cai no salvo", async () => {
    const { service } = build();
    expect(await service.resolveDocument(TENANT, undefined)).toBeNull();
    expect(await service.resolveDocument(TENANT, "11.222.333/0001-81")).toBe("11222333000181");
    expect(await service.resolveDocument(TENANT, undefined)).toBe("11222333000181");
    await expect(service.resolveDocument(TENANT, "123")).rejects.toThrow(BadRequestException);
  });
});

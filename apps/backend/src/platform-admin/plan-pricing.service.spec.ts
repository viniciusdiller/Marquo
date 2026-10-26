import "reflect-metadata";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PLAN_CATALOG } from "@marquo/shared-types";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { SetPlanPriceDto } from "./dto/platform-admin.dto";
import { AUDIT_PLAN_PRICE_SET, PlanPricingService } from "./plan-pricing.service";
import { MAX_PLAN_PRICE_CENTS, MIN_CHARGE_CENTS } from "../billing/payments/pricing";
import { PrismaService } from "../prisma/prisma.service";

const LIST = Object.fromEntries(PLAN_CATALOG.map((p) => [p.tier, p.priceCents])) as Record<string, number>;
const ids = Object.fromEntries(PLAN_CATALOG.map((p) => [p.tier, `id-${p.tier}`]));

function build(prices: Record<string, number> = LIST, updatedCount = 1) {
  const tx = {
    plan: { updateMany: jest.fn().mockResolvedValue({ count: updatedCount }) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    plan: {
      findMany: jest.fn().mockImplementation(() =>
        Promise.resolve(PLAN_CATALOG.map((p) => ({ id: ids[p.tier], tier: p.tier, priceCents: prices[p.tier] }))),
      ),
    },
    subscription: { groupBy: jest.fn().mockResolvedValue([{ planId: ids.ESSENCIAL, _count: { id: 3 } }]) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new PlanPricingService(prisma as unknown as PrismaService), prisma, tx };
}

describe("PlanPricingService.list", () => {
  it("mostra preço atual, preço de tabela, piso e quantos assinantes de cartão não mudam de valor", async () => {
    const { service } = build({ ...LIST, ESSENCIAL: 3990 });
    const [essencial, profissional] = await service.list();
    expect(essencial).toMatchObject({
      tier: "ESSENCIAL",
      priceCents: 3990,
      listPriceCents: LIST.ESSENCIAL,
      minPriceCents: MIN_CHARGE_CENTS,
      maxPriceCents: MAX_PLAN_PRICE_CENTS,
      cardSubscribers: 3,
    });
    expect(profissional).toMatchObject({ priceCents: LIST.PROFISSIONAL, cardSubscribers: 0 });
  });
});

describe("PlanPricingService.setPrice", () => {
  it("baixa o preço, grava o override e audita com o autor, sem tenant", async () => {
    const { service, tx } = build();
    await service.setPrice("ESSENCIAL", 3990, "admin@x.com");

    expect(tx.plan.updateMany).toHaveBeenCalledWith({
      where: { tier: "ESSENCIAL", priceCents: LIST.ESSENCIAL },
      data: { priceCents: 3990, priceOverrideCents: 3990 },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: { action: AUDIT_PLAN_PRICE_SET, actor: "admin@x.com", detail: "Essencial: R$ 49,90 → R$ 39,90" },
    });
  });

  it("voltar ao preço de tabela limpa o override", async () => {
    const { service, tx } = build({ ...LIST, ESSENCIAL: 3990 });
    await service.setPrice("ESSENCIAL", LIST.ESSENCIAL, "admin@x.com");
    expect(tx.plan.updateMany.mock.calls[0][0].data).toEqual({ priceCents: LIST.ESSENCIAL, priceOverrideCents: null });
  });

  it("permite subir acima do preço de tabela e grava o override", async () => {
    const { service, tx } = build();
    await service.setPrice("ESSENCIAL", LIST.ESSENCIAL + 1000, "admin@x.com");
    expect(tx.plan.updateMany.mock.calls[0][0].data).toEqual({
      priceCents: LIST.ESSENCIAL + 1000,
      priceOverrideCents: LIST.ESSENCIAL + 1000,
    });
    expect(tx.adminAuditLog.create.mock.calls[0][0].data.detail).toBe("Essencial: R$ 49,90 → R$ 59,90");
  });

  it("recusa acima do teto (zero a mais por engano)", async () => {
    const top = build({ ...LIST, PREMIUM: LIST.PREMIUM });
    await expect(top.service.setPrice("PREMIUM", MAX_PLAN_PRICE_CENTS + 1, "a")).rejects.toThrow(BadRequestException);
    expect(top.tx.plan.updateMany).not.toHaveBeenCalled();
  });

  it.each([MIN_CHARGE_CENTS - 1, 0, -100, 39.9, NaN])("recusa valor abaixo do piso ou não inteiro (%s)", async (value) => {
    const { service, tx } = build();
    await expect(service.setPrice("ESSENCIAL", value, "a")).rejects.toThrow(BadRequestException);
    expect(tx.plan.updateMany).not.toHaveBeenCalled();
  });

  it("recusa plano maior igual ou mais barato que o menor, e menor igual ou mais caro que o maior", async () => {
    const { service } = build();
    await expect(service.setPrice("PROFISSIONAL", LIST.ESSENCIAL, "a")).rejects.toThrow(BadRequestException);
    const lowered = build({ ...LIST, PROFISSIONAL: 5000 });
    await expect(lowered.service.setPrice("ESSENCIAL", 5000, "a")).rejects.toThrow(BadRequestException);
  });

  it("recusa tier desconhecido (404) e preço igual ao atual (409)", async () => {
    const { service } = build();
    await expect(service.setPrice("GRATIS", 1000, "a")).rejects.toThrow(NotFoundException);
    await expect(service.setPrice("ESSENCIAL", LIST.ESSENCIAL, "a")).rejects.toThrow(ConflictException);
  });

  it("alteração concorrente: não grava auditoria e devolve 409", async () => {
    const { service, tx } = build(LIST, 0);
    await expect(service.setPrice("ESSENCIAL", 3990, "a")).rejects.toThrow(ConflictException);
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("rotas de preço dos planos", () => {
  const proto = PlatformAdminController.prototype;
  const guards = (h: keyof PlatformAdminController) => Reflect.getMetadata("__guards__", proto[h] as object) as unknown[];

  it.each(["listPlans", "setPlanPrice"] as const)("%s exige a sessão da plataforma", (handler) => {
    expect(guards(handler)).toContain(PlatformAdminGuard);
  });

  it("alterar usa o e-mail da conta como autor e só o preço do corpo", async () => {
    const setPrice = jest.fn().mockResolvedValue({});
    const controller = new PlatformAdminController({} as never, {} as never, {} as never, {} as never, {} as never, { setPrice } as never);
    await controller.setPlanPrice("ESSENCIAL" as never, { priceCents: 3990 }, { email: "admin@x.com" } as never);
    expect(setPrice).toHaveBeenCalledWith("ESSENCIAL", 3990, "admin@x.com");
  });

  it("o DTO recusa texto, decimal, zero e campo extra de valor", async () => {
    const check = async (body: unknown) => (await validate(plainToInstance(SetPlanPriceDto, body as object))).length;
    expect(await check({ priceCents: 3990 })).toBe(0);
    for (const bad of [{ priceCents: "3990" }, { priceCents: 39.9 }, { priceCents: 0 }, { priceCents: -1 }, { priceCents: MAX_PLAN_PRICE_CENTS + 1 }, {}]) {
      expect(await check(bad)).toBeGreaterThan(0);
    }
  });
});

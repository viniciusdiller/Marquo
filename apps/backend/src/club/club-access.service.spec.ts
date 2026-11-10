import { ForbiddenException } from "@nestjs/common";
import { ClubAccessService, CLUB_DISABLED_MESSAGE, CLUB_PLAN_REQUIRED_MESSAGE } from "./club-access.service";
import { PrismaService } from "../prisma/prisma.service";

function build(tier: string | null, clubEnabled: boolean) {
  const prisma = {
    subscription: { findUnique: jest.fn().mockResolvedValue(tier ? { plan: { tier, name: tier === "PREMIUM" ? "Premium" : tier === "PROFISSIONAL" ? "Profissional" : "Essencial" } } : null) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ clubEnabled }) },
  };
  return { prisma, service: new ClubAccessService(prisma as unknown as PrismaService) };
}

describe("ClubAccessService", () => {
  it.each([
    ["PROFISSIONAL", true],
    ["PREMIUM", true],
    ["ESSENCIAL", false],
  ])("plano %s: o plano permite o clube? %s", async (tier, allowed) => {
    const { service } = build(tier, true);
    expect((await service.overview("t-1")).planAllowsClub).toBe(allowed);
  });

  it("sem assinatura (período de teste) vale o plano de entrada: sem clube", async () => {
    const { service } = build(null, true);
    expect(await service.isActive("t-1")).toBe(false);
    await expect(service.assertActive("t-1")).rejects.toThrow(new ForbiddenException(CLUB_PLAN_REQUIRED_MESSAGE));
  });

  it("só está ativo com plano que inclui o clube E o dono ligado", async () => {
    expect(await build("PREMIUM", true).service.isActive("t-1")).toBe(true);
    expect(await build("PREMIUM", false).service.isActive("t-1")).toBe(false);
    expect(await build("ESSENCIAL", true).service.isActive("t-1")).toBe(false);
  });

  it("assertActive diferencia plano insuficiente de clube desligado", async () => {
    await expect(build("ESSENCIAL", true).service.assertActive("t-1")).rejects.toThrow(CLUB_PLAN_REQUIRED_MESSAGE);
    await expect(build("PROFISSIONAL", false).service.assertActive("t-1")).rejects.toThrow(CLUB_DISABLED_MESSAGE);
    await expect(build("PROFISSIONAL", true).service.assertActive("t-1")).resolves.toBeUndefined();
  });

  // Downgrade: o dono tinha ligado, trocou para o Essencial. Nada é apagado, mas o clube deixa de valer.
  it("downgrade desliga o efeito sem mexer na escolha do dono", async () => {
    const { service } = build("ESSENCIAL", true);
    expect(await service.overview("t-1")).toEqual({ onTrial: false, planName: "Essencial", planAllowsClub: false, enabled: true });
    expect(await service.isActive("t-1")).toBe(false);
  });

  it("tier desconhecido nunca libera o clube", async () => {
    expect((await build("NOVO_PLANO", true).service.overview("t-1")).planAllowsClub).toBe(false);
  });

  it("consulta tenant e assinatura pelo id do negócio", async () => {
    const { service, prisma } = build("PREMIUM", true);
    await service.overview("t-9");
    expect(prisma.subscription.findUnique.mock.calls[0][0].where).toEqual({ tenantId: "t-9" });
    expect(prisma.tenant.findUnique.mock.calls[0][0].where).toEqual({ id: "t-9" });
  });

  // A tela precisa explicar POR QUE o clube está bloqueado: no teste não há assinatura (vale o plano de entrada), e quem só
  // escolheu "Profissional" no cadastro continua no teste até assinar.
  it("informa se está no período de teste e qual é o plano assinado", async () => {
    expect(await build(null, false).service.overview("t-1")).toEqual({ onTrial: true, planName: null, planAllowsClub: false, enabled: false });
    expect(await build("PREMIUM", true).service.overview("t-1")).toEqual({ onTrial: false, planName: "Premium", planAllowsClub: true, enabled: true });
  });
});

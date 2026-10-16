import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type BillingStatus,
  type BillingStatusResponse,
  type PlanInfo,
  bannerFor,
  daysUntil,
  formatBRL,
  formatDate,
  hasBillingAccess,
  isPlanInfo,
  planActionFor,
  type BillingMethod,
} from "./billing.ts";

const NOW = Date.parse("2026-09-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

const PRO: PlanInfo = { tier: "PROFISSIONAL", name: "Profissional", priceCents: 7990, maxProfessionals: 5 };

function billing(status: BillingStatus, extra: Partial<BillingStatusResponse> = {}): BillingStatusResponse {
  return { status, trialEndsAt: iso(10), paymentsEnabled: true, subscription: null, ...extra };
}
const withSub = (
  status: BillingStatus,
  over: { cancelAtPeriodEnd?: boolean; courtesy?: boolean; method?: BillingMethod | null; endInDays?: number } = {},
) =>
  billing(status, {
    subscription: {
      status,
      currentPeriodEnd: iso(over.endInDays ?? 20),
      cancelAtPeriodEnd: over.cancelAtPeriodEnd ?? false,
      courtesy: over.courtesy ?? false,
      method: over.method === undefined ? "CARD_RECURRING" : over.method,
      plan: PRO,
    },
  });

describe("hasBillingAccess (espelha o backend)", () => {
  it("libera teste, ativa e em atraso; bloqueia o resto", () => {
    const expected: Record<BillingStatus, boolean> = {
      TRIALING: true,
      ACTIVE: true,
      PAST_DUE: true,
      TRIAL_EXPIRED: false,
      CANCELED: false,
      INCOMPLETE: false,
      UNPAID: false,
      SUSPENDED: false,
      EXPIRED: false,
      PERIOD_ENDED: false,
    };
    for (const [status, access] of Object.entries(expected)) {
      assert.equal(hasBillingAccess(status as BillingStatus), access, status);
    }
  });
});

describe("bannerFor", () => {
  it("sem aviso para assinatura ativa e para teste com mais de 3 dias", () => {
    assert.equal(bannerFor(withSub("ACTIVE"), NOW), null);
    assert.equal(bannerFor(billing("TRIALING", { trialEndsAt: iso(4) }), NOW), null);
  });

  it("teste: 'termina em N dia(s)' nos 3 últimos dias e 'hoje' no último", () => {
    assert.equal(bannerFor(billing("TRIALING", { trialEndsAt: iso(3) }), NOW)?.message, "Seu período de teste termina em 3 dias.");
    assert.equal(bannerFor(billing("TRIALING", { trialEndsAt: iso(1) }), NOW)?.message, "Seu período de teste termina em 1 dia.");
    assert.equal(bannerFor(billing("TRIALING", { trialEndsAt: iso(0) }), NOW)?.message, "Seu período de teste termina hoje.");
    assert.equal(bannerFor(billing("TRIALING", { trialEndsAt: iso(2) }), NOW)?.tone, "warning");
  });

  // Suspensão manual pela plataforma: não pode ser confundida com "teste vencido" (o dono acharia que
  // basta ativar um plano).
  it("suspensão manual: mensagem própria e sem falar em teste", () => {
    const banner = bannerFor(billing("SUSPENDED"), NOW);
    assert.ok(banner);
    assert.equal(banner.tone, "danger");
    assert.match(banner.message, /suspensa/i);
    assert.doesNotMatch(banner.message, /teste/i);
  });

  it("cortesia vencida: aviso próprio, sem falar em teste nem em assinar", () => {
    const banner = bannerFor(billing("EXPIRED"), NOW);
    assert.ok(banner);
    assert.equal(banner.tone, "danger");
    assert.match(banner.message, /cortesia/i);
    assert.doesNotMatch(banner.message, /teste|assin/i);
  });

  it("Pix mensal vencido: aviso próprio que manda gerar o Pix do próximo mês", () => {
    const banner = bannerFor(billing("PERIOD_ENDED"), NOW);
    assert.ok(banner);
    assert.equal(banner.tone, "danger");
    assert.match(banner.message, /Pix do próximo mês/);
    assert.match(banner.ctaLabel, /próximo mês/i);
  });

  it("estados bloqueados apontam uma ação de pagamento, não um beco sem saída", () => {
    const states: BillingStatus[] = ["TRIAL_EXPIRED", "CANCELED", "UNPAID", "INCOMPLETE", "EXPIRED", "PERIOD_ENDED"];
    for (const status of states) {
      const banner = bannerFor(billing(status), NOW);
      assert.ok(banner, status);
      assert.ok(banner.ctaLabel.length > 0, status);
      assert.doesNotMatch(banner.message, /stripe|portal/i, status);
    }
  });

  it("cada estado bloqueado tem mensagem própria e tom de perigo, com chamada para agir", () => {
    const blocked: BillingStatus[] = ["TRIAL_EXPIRED", "CANCELED", "UNPAID", "INCOMPLETE"];
    const banners = blocked.map((status) => bannerFor(billing(status), NOW));
    for (const banner of banners) {
      assert.ok(banner);
      assert.equal(banner.tone, "danger");
      assert.ok(banner.ctaLabel.length > 0);
    }
    assert.equal(new Set(banners.map((b) => b?.message)).size, blocked.length);
    // Só o teste vencido fala em "teste": era o texto único que confundia quem cancelou.
    for (const status of ["CANCELED", "UNPAID", "INCOMPLETE"] as const) {
      assert.doesNotMatch(bannerFor(billing(status), NOW)?.message ?? "", /teste/i);
    }
  });

  it("em atraso é aviso (ainda tem acesso), não perigo", () => {
    const banner = bannerFor(withSub("PAST_DUE"), NOW);
    assert.equal(banner?.tone, "warning");
    assert.match(banner?.message ?? "", /Regularize/);
  });

  it("cancelamento agendado: avisa a data e diz que o acesso segue até lá", () => {
    const banner = bannerFor(withSub("ACTIVE", { cancelAtPeriodEnd: true }), NOW);
    assert.equal(banner?.tone, "warning");
    assert.match(banner?.message ?? "", /será encerrada em \d{2}\/\d{2}\/\d{4}/);
    assert.match(banner?.message ?? "", /mantém o acesso/);
  });
});

describe("planActionFor: o botão de cada plano", () => {
  it("sem assinatura (teste, vencido) todo plano é 'assinar'", () => {
    for (const status of ["TRIALING", "TRIAL_EXPIRED"] as const) {
      assert.equal(planActionFor(billing(status), "PREMIUM", NOW), "SUBSCRIBE", status);
    }
  });

  it("cortesia pode ser substituída por uma assinatura paga", () => {
    assert.equal(planActionFor(withSub("ACTIVE", { courtesy: true, method: null }), "PREMIUM", NOW), "SUBSCRIBE");
    assert.equal(planActionFor(billing("EXPIRED"), "PREMIUM", NOW), "SUBSCRIBE");
  });

  it("cartão ativo: o plano atual é 'seu plano' e os outros oferecem a TROCA", () => {
    assert.equal(planActionFor(withSub("ACTIVE"), "PROFISSIONAL", NOW), "CURRENT");
    assert.equal(planActionFor(withSub("ACTIVE"), "PREMIUM", NOW), "CHANGE");
    assert.equal(planActionFor(withSub("ACTIVE"), "ESSENCIAL", NOW), "CHANGE");
  });

  it("sem troca quando a assinatura está cancelada ou em atraso (o backend recusa)", () => {
    assert.equal(planActionFor(withSub("ACTIVE", { cancelAtPeriodEnd: true }), "PREMIUM", NOW), "BLOCKED");
    assert.equal(planActionFor(withSub("PAST_DUE"), "PREMIUM", NOW), "BLOCKED");
  });

  // O requisito: no Pix o dono precisa poder pagar o mês seguinte quando o mês acaba.
  it("Pix: longe do vencimento só mostra o atual; perto ou vencido libera pagar de novo", () => {
    assert.equal(planActionFor(withSub("ACTIVE", { method: "PIX_MONTHLY", endInDays: 25 }), "PROFISSIONAL", NOW), "CURRENT");
    assert.equal(planActionFor(withSub("ACTIVE", { method: "PIX_MONTHLY", endInDays: 25 }), "PREMIUM", NOW), "CHANGE");
    assert.equal(planActionFor(withSub("ACTIVE", { method: "PIX_MONTHLY", endInDays: 4 }), "PROFISSIONAL", NOW), "RENEW_PIX");
    assert.equal(planActionFor(withSub("PERIOD_ENDED", { method: "PIX_MONTHLY", endInDays: -2 }), "PROFISSIONAL", NOW), "RENEW_PIX");
  });

  it("sem provedor configurado ou suspenso: nenhum botão de pagar", () => {
    assert.equal(planActionFor(billing("TRIAL_EXPIRED", { paymentsEnabled: false }), "PREMIUM", NOW), "BLOCKED");
    assert.equal(planActionFor(billing("SUSPENDED"), "PREMIUM", NOW), "BLOCKED");
  });
});

describe("formatação", () => {
  it("daysUntil arredonda para cima", () => {
    assert.equal(daysUntil(new Date(NOW + 1000).toISOString(), NOW), 1);
    assert.equal(daysUntil(new Date(NOW + 2 * DAY).toISOString(), NOW), 2);
    assert.equal(daysUntil(new Date(NOW - 1000).toISOString(), NOW), 0);
  });

  it("dinheiro em reais a partir de centavos", () => {
    assert.match(formatBRL(7990).replace(/\s/g, " "), /^R\$ 79,90$/);
    assert.match(formatBRL(149_90).replace(/\s/g, " "), /^R\$ 149,90$/);
  });

  it("data no fuso do Brasil (23h em SP não vira o dia seguinte)", () => {
    // 2026-10-09T02:30Z = 08/10 às 23:30 em São Paulo.
    assert.equal(formatDate("2026-10-09T02:30:00Z"), "08/10/2026");
  });
});

describe("isPlanInfo", () => {
  const ok = { tier: "PROFISSIONAL", name: "Profissional", priceCents: 7990, maxProfessionals: 5 };

  it("aceita a forma que GET /plans devolve (com e sem limite)", () => {
    assert.equal(isPlanInfo(ok), true);
    assert.equal(isPlanInfo({ ...ok, tier: "PREMIUM", maxProfessionals: null }), true);
  });

  // A resposta vem de fora do TypeScript: forma errada não pode chegar à tela como se fosse um plano.
  it("recusa tier desconhecido, preço inválido e limite incoerente", () => {
    for (const bad of [
      null, "x", 1, {}, { ...ok, tier: "GRATIS" }, { ...ok, name: 3 }, { ...ok, priceCents: -1 },
      { ...ok, priceCents: 79.9 }, { ...ok, priceCents: "7990" }, { ...ok, maxProfessionals: 0 },
      { ...ok, maxProfessionals: 2.5 }, { ...ok, maxProfessionals: undefined },
    ]) {
      assert.equal(isPlanInfo(bad), false, JSON.stringify(bad));
    }
  });
});

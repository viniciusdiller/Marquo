import { SubscriptionStatus } from "@marquo/database";
import {
  BillingStatus,
  billingBlockMessage,
  computeBillingStatus,
  hasBillingAccess,
} from "./billing-status.util";

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

describe("computeBillingStatus", () => {
  it("sem assinatura: TRIALING até o fim do trial e TRIAL_EXPIRED depois", () => {
    expect(computeBillingStatus({ trialEndsAt: FUTURE }, null)).toBe("TRIALING");
    expect(computeBillingStatus({ trialEndsAt: PAST }, null)).toBe("TRIAL_EXPIRED");
  });

  it("com assinatura, o status dela vence o trial (mesmo com trial ainda válido)", () => {
    expect(computeBillingStatus({ trialEndsAt: FUTURE }, { status: SubscriptionStatus.CANCELED })).toBe(
      "CANCELED",
    );
    expect(computeBillingStatus({ trialEndsAt: PAST }, { status: SubscriptionStatus.ACTIVE })).toBe("ACTIVE");
  });

  describe("cortesia (concedida pela plataforma, sem cobrança)", () => {
    const ACTIVE = SubscriptionStatus.ACTIVE;

    it("vigente (ou sem data de fim): acesso normal", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, { status: ACTIVE, courtesy: true, currentPeriodEnd: FUTURE })).toBe("ACTIVE");
      expect(computeBillingStatus({ trialEndsAt: PAST }, { status: ACTIVE, courtesy: true, currentPeriodEnd: null })).toBe("ACTIVE");
    });

    it("com a data de fim vencida: EXPIRED, mesmo com status ACTIVE gravado", () => {
      expect(computeBillingStatus({ trialEndsAt: FUTURE }, { status: ACTIVE, courtesy: true, currentPeriodEnd: PAST })).toBe("EXPIRED");
    });

    // Assinatura paga tem o currentPeriodEnd renovado pelo provedor; só a cortesia expira por data.
    it("assinatura paga com período vencido NÃO vira EXPIRED (o estado vem do provedor)", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, { status: ACTIVE, courtesy: false, currentPeriodEnd: PAST })).toBe("ACTIVE");
    });

    it("suspensão vence a cortesia vigente", () => {
      expect(
        computeBillingStatus({ trialEndsAt: PAST, suspendedAt: new Date() }, { status: ACTIVE, courtesy: true, currentPeriodEnd: FUTURE }),
      ).toBe("SUSPENDED");
    });
  });

  describe("assinatura paga (cartão recorrente / Pix mensal)", () => {
    const ACTIVE = SubscriptionStatus.ACTIVE;
    const sub = (over: Record<string, unknown>) => ({ status: ACTIVE, courtesy: false, ...over });

    it("cartão ativo com a próxima cobrança no futuro: ACTIVE", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "CARD_RECURRING", currentPeriodEnd: FUTURE }))).toBe("ACTIVE");
    });

    // O requisito: no Pix mensal, acabou o mês sem novo pagamento, o salão perde o acesso.
    it("Pix mensal: dentro do mês ACTIVE; passou do fim sem novo pagamento PERIOD_ENDED", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "PIX_MONTHLY", currentPeriodEnd: FUTURE }))).toBe("ACTIVE");
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "PIX_MONTHLY", currentPeriodEnd: PAST }))).toBe("PERIOD_ENDED");
    });

    it("Pix pago de novo (período estendido) volta a ACTIVE", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "PIX_MONTHLY", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) }))).toBe("ACTIVE");
    });

    it("cartão: o fim do período NÃO derruba (o provedor renova o currentPeriodEnd)", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "CARD_RECURRING", currentPeriodEnd: PAST }))).toBe("ACTIVE");
    });

    it("cancelada com acesso até o fim do período: vale até lá e depois bloqueia", () => {
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "CARD_RECURRING", cancelAtPeriodEnd: true, currentPeriodEnd: FUTURE }))).toBe("ACTIVE");
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ method: "CARD_RECURRING", cancelAtPeriodEnd: true, currentPeriodEnd: PAST }))).toBe("CANCELED");
    });

    it("em atraso: acesso durante a tolerância e bloqueio depois dela", () => {
      const dayAgo = new Date(Date.now() - 86_400_000);
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const pastDue = SubscriptionStatus.PAST_DUE;
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ status: pastDue, method: "CARD_RECURRING", currentPeriodEnd: dayAgo }))).toBe("PAST_DUE");
      expect(computeBillingStatus({ trialEndsAt: PAST }, sub({ status: pastDue, method: "CARD_RECURRING", currentPeriodEnd: weekAgo }))).toBe("UNPAID");
    });
  });

  // A suspensão pela plataforma vale mesmo com assinatura ativa ou trial vigente: sem isso, pagar
  // (ou ter trial sobrando) desfazia a suspensão.
  it("suspensão manual vence assinatura ativa e trial vigente", () => {
    const suspendedAt = new Date();
    expect(computeBillingStatus({ trialEndsAt: FUTURE, suspendedAt }, null)).toBe("SUSPENDED");
    expect(
      computeBillingStatus({ trialEndsAt: FUTURE, suspendedAt }, { status: SubscriptionStatus.ACTIVE }),
    ).toBe("SUSPENDED");
    expect(computeBillingStatus({ trialEndsAt: FUTURE, suspendedAt: null }, null)).toBe("TRIALING");
  });
});

describe("hasBillingAccess", () => {
  it.each<[BillingStatus, boolean]>([
    ["TRIALING", true],
    ["ACTIVE", true],
    ["PAST_DUE", true], // período de graça durante as novas tentativas de cobrança
    ["TRIAL_EXPIRED", false],
    ["CANCELED", false],
    ["INCOMPLETE", false],
    ["UNPAID", false],
    ["SUSPENDED", false],
    ["EXPIRED", false],
    ["PERIOD_ENDED", false],
  ])("%s -> acesso %s", (status, expected) => {
    expect(hasBillingAccess(status)).toBe(expected);
  });
});

// Regressão: o guard dizia "Período de teste encerrado" para qualquer bloqueio, inclusive
// assinatura cancelada ou inadimplente, e o dono não sabia o que fazer.
describe("billingBlockMessage", () => {
  it("cada estado bloqueado tem mensagem própria, e só o teste vencido fala em teste", () => {
    const blocked: BillingStatus[] = ["TRIAL_EXPIRED", "CANCELED", "UNPAID", "INCOMPLETE"];
    const messages = blocked.map(billingBlockMessage);

    expect(new Set(messages).size).toBe(blocked.length);
    expect(billingBlockMessage("TRIAL_EXPIRED")).toMatch(/período de teste terminou/i);
    for (const status of ["CANCELED", "UNPAID", "INCOMPLETE"] as const) {
      expect(billingBlockMessage(status)).not.toMatch(/teste/i);
    }
  });

  // Cada mensagem manda o dono para a tela certa; nenhuma cita provedor nem o deixa sem saída.
  it("toda mensagem de bloqueio aponta para Plano e cobrança (ou para o suporte, na suspensão)", () => {
    const blocked: BillingStatus[] = ["TRIAL_EXPIRED", "CANCELED", "UNPAID", "INCOMPLETE", "SUSPENDED", "EXPIRED", "PERIOD_ENDED"];
    for (const status of blocked) {
      expect(billingBlockMessage(status)).toMatch(/Plano e cobrança|suporte/);
      expect(billingBlockMessage(status)).not.toMatch(/stripe|mercado/i);
    }
  });

  it("Pix mensal vencido tem mensagem própria, que fala do Pix do próximo mês", () => {
    expect(billingBlockMessage("PERIOD_ENDED")).toMatch(/Pix do próximo mês/);
  });
});

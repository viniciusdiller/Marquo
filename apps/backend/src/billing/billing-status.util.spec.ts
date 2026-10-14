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
});

describe("hasBillingAccess", () => {
  it.each<[BillingStatus, boolean]>([
    ["TRIALING", true],
    ["ACTIVE", true],
    ["PAST_DUE", true], // período de graça durante os retries do Stripe
    ["TRIAL_EXPIRED", false],
    ["CANCELED", false],
    ["INCOMPLETE", false],
    ["UNPAID", false],
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

  it("cancelada manda assinar de novo; não paga manda atualizar o pagamento", () => {
    expect(billingBlockMessage("CANCELED")).toMatch(/Assine novamente/);
    expect(billingBlockMessage("UNPAID")).toMatch(/forma de pagamento/);
  });
});

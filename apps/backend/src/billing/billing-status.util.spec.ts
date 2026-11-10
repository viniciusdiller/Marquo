import { BillingMethod, SubscriptionStatus } from "@marquo/database";
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

// ───────── billingAccessWhere: o filtro de banco tem de dar a MESMA resposta que hasBillingAccess(computeBillingStatus) ─────────
// Interpretador mínimo do subconjunto de filtro do Prisma que o filtro usa, com a semântica do SQL: comparar coluna NULL com
// qualquer coisa (inclusive `not`) NÃO casa. É exatamente a armadilha que o filtro evita escrevendo sem NOT.
import { billingAccessWhere, computeBillingStatus as statusOf, hasBillingAccess as hasAccess, PAST_DUE_GRACE_MS } from "./billing-status.util";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !(v instanceof Date);

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (isObj(cond)) {
    // Operador sobre coluna nula nunca casa (SQL).
    if (value === null || value === undefined) return false;
    const v = value instanceof Date ? value.getTime() : value;
    const c = (x: unknown) => (x instanceof Date ? x.getTime() : x);
    if ("gt" in cond && !((v as number) > (c(cond.gt) as number))) return false;
    if ("gte" in cond && !((v as number) >= (c(cond.gte) as number))) return false;
    if ("lte" in cond && !((v as number) <= (c(cond.lte) as number))) return false;
    if ("not" in cond && !(v !== c(cond.not))) return false;
    return true;
  }
  return value === cond;
}

function matches(row: Obj | null, where: Obj): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Obj[]).some((c) => matches(row, c));
    if (key === "AND") return (cond as Obj[]).every((c) => matches(row, c));
    if (key === "subscription") {
      const rel = cond as { is: Obj | null };
      const sub = (row?.subscription ?? null) as Obj | null;
      return rel.is === null ? sub === null : sub !== null && matches(sub, rel.is);
    }
    return matchField(row?.[key], cond);
  });
}

describe("billingAccessWhere: equivalente a hasBillingAccess(computeBillingStatus)", () => {
  const NOW = new Date("2026-11-10T12:00:00.000Z");
  const H = 3_600_000;
  const offsets: Array<number | null> = [null, -10 * 24 * H, -PAST_DUE_GRACE_MS - H, -PAST_DUE_GRACE_MS, -PAST_DUE_GRACE_MS + H, -H, 0, H, 10 * 24 * H];
  const statuses = Object.values(SubscriptionStatus);
  const methods: Array<BillingMethod | null> = [null, BillingMethod.CARD_RECURRING, BillingMethod.PIX_MONTHLY];

  const cases: Array<{ tenant: Obj; subscription: Obj | null }> = [];
  for (const suspended of [false, true]) {
    for (const trialOffset of [-H, H]) {
      const tenant = { suspendedAt: suspended ? new Date(NOW.getTime() - H) : null, trialEndsAt: new Date(NOW.getTime() + trialOffset) };
      cases.push({ tenant, subscription: null });
      for (const status of statuses)
        for (const courtesy of [false, true])
          for (const method of methods)
            for (const cancelAtPeriodEnd of [false, true])
              for (const off of offsets)
                cases.push({
                  tenant,
                  subscription: { status, courtesy, method, cancelAtPeriodEnd, currentPeriodEnd: off === null ? null : new Date(NOW.getTime() + off) },
                });
    }
  }

  it(`dá a mesma resposta nas ${cases.length} combinações (assinatura, cortesia, Pix, cancelamento, atraso, teste, suspensão)`, () => {
    const where = billingAccessWhere(NOW) as Obj;
    const divergent = cases.filter(({ tenant, subscription }) => {
      const expected = hasAccess(statusOf(tenant as never, subscription as never, NOW.getTime()));
      return matches({ ...tenant, subscription }, where) !== expected;
    });
    expect(divergent).toEqual([]);
  });

  it("negócio no teste, assinatura ativa sem data de fim e PAST_DUE na tolerância aparecem; teste vencido e suspenso não", () => {
    const where = billingAccessWhere(NOW) as Obj;
    const t = (trialOffset: number, suspended = false) => ({ suspendedAt: suspended ? NOW : null, trialEndsAt: new Date(NOW.getTime() + trialOffset) });
    expect(matches({ ...t(H), subscription: null }, where)).toBe(true);
    expect(matches({ ...t(-H), subscription: null }, where)).toBe(false);
    expect(matches({ ...t(H, true), subscription: null }, where)).toBe(false);
    expect(matches({ ...t(-H), subscription: { status: "ACTIVE", courtesy: false, method: null, cancelAtPeriodEnd: false, currentPeriodEnd: null } }, where)).toBe(true);
  });
});

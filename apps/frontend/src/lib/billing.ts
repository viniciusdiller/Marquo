// Tipos e regras de cobrança do dashboard. Sem React nem next/*: testável com node --test.
// Tudo aqui é APRESENTAÇÃO. Quem decide acesso, preço e troca de plano é o backend; estes helpers só
// espelham o que ele já responde para a tela mostrar a coisa certa.

export type BillingStatus =
  | "TRIALING"
  | "TRIAL_EXPIRED"
  | "SUSPENDED" // suspensão manual pela plataforma: vence qualquer estado de cobrança
  | "EXPIRED" // cortesia concedida pela plataforma que chegou ao fim
  | "PERIOD_ENDED" // Pix mensal cujo mês acabou sem um novo pagamento
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE"
  | "UNPAID";

export type PlanTier = "ESSENCIAL" | "PROFISSIONAL" | "PREMIUM";

export interface PlanInfo {
  tier: PlanTier;
  name: string;
  priceCents: number;
  maxProfessionals: number | null;
}

// A resposta de GET /plans vem de fora do TypeScript: confere a forma antes de usar (tier conhecido, preço e
// limite coerentes) em vez de confiar no cast.
export function isPlanInfo(value: unknown): value is PlanInfo {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.tier === "ESSENCIAL" || v.tier === "PROFISSIONAL" || v.tier === "PREMIUM") &&
    typeof v.name === "string" &&
    typeof v.priceCents === "number" &&
    Number.isInteger(v.priceCents) &&
    v.priceCents >= 0 &&
    (v.maxProfessionals === null || (typeof v.maxProfessionals === "number" && Number.isInteger(v.maxProfessionals) && v.maxProfessionals > 0))
  );
}

export type BillingMethod = "CARD_RECURRING" | "PIX_MONTHLY";

export interface BillingStatusResponse {
  status: BillingStatus;
  trialEndsAt: string;
  // Há provedor de pagamento configurado? Sem ele a tela só informa ("fale com a equipe").
  paymentsEnabled: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    // Acesso concedido pela plataforma, sem cobrança. Termina em currentPeriodEnd (nulo = sem data).
    courtesy: boolean;
    // Cartão recorrente ou Pix mensal; nulo na cortesia.
    method: BillingMethod | null;
    plan: PlanInfo;
  } | null;
}

// Espelha billing-status.util.ts do backend (hasBillingAccess).
export function hasBillingAccess(status: BillingStatus): boolean {
  return status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(iso: string, now: number = Date.now()): number {
  const days = Math.ceil((new Date(iso).getTime() - now) / DAY_MS);
  return days === 0 ? 0 : days; // Math.ceil(-0.0001) dá -0, que não é igual a 0 em comparação estrita
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

// "2026-10-08T15:04:00Z" -> "08/10/2026", no fuso do Brasil (o resto do produto assume
// America/Sao_Paulo): sem isso um fim de trial às 23h no Brasil apareceria como o dia seguinte.
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export interface BannerInfo {
  message: string;
  tone: "warning" | "danger";
  ctaLabel: string;
}

// Mensagens iguais às do backend (billingBlockMessage) para o mesmo estado.
export function bannerFor(billing: BillingStatusResponse, now: number = Date.now()): BannerInfo | null {
  switch (billing.status) {
    case "ACTIVE":
      return billing.subscription?.cancelAtPeriodEnd && billing.subscription.currentPeriodEnd
        ? {
            message: `Sua assinatura será encerrada em ${formatDate(billing.subscription.currentPeriodEnd)}. Você mantém o acesso até lá.`,
            tone: "warning",
            ctaLabel: "Ver plano",
          }
        : null;
    case "SUSPENDED":
      return {
        message: "Sua conta foi suspensa pela equipe do Marquo. Entre em contato com o suporte para reativar o acesso.",
        tone: "danger",
        ctaLabel: "Ver detalhes",
      };
    case "EXPIRED":
      return {
        message: "Seu acesso de cortesia terminou. Escolha um plano para continuar usando o Marquo.",
        tone: "danger",
        ctaLabel: "Escolher plano",
      };
    case "PERIOD_ENDED":
      return {
        message: "O mês do seu plano terminou. Gere o Pix do próximo mês para voltar a usar o Marquo.",
        tone: "danger",
        ctaLabel: "Pagar o próximo mês",
      };
    case "TRIALING": {
      const left = daysUntil(billing.trialEndsAt, now);
      if (left > 3) return null;
      return {
        message: left <= 0 ? "Seu período de teste termina hoje." : `Seu período de teste termina em ${left} dia${left === 1 ? "" : "s"}.`,
        tone: "warning",
        ctaLabel: "Escolher plano",
      };
    }
    case "TRIAL_EXPIRED":
      return {
        message:
          "Seu período de teste acabou. A página pública também parou de aceitar novos agendamentos até você assinar um plano.",
        tone: "danger",
        ctaLabel: "Assinar agora",
      };
    case "PAST_DUE":
      return {
        message: "Há um problema com o pagamento da sua assinatura. Regularize para não perder o acesso.",
        tone: "warning",
        ctaLabel: "Regularizar pagamento",
      };
    case "CANCELED":
      return {
        message: "Sua assinatura foi cancelada. Assine novamente para voltar a usar o Marquo.",
        tone: "danger",
        ctaLabel: "Assinar novamente",
      };
    case "UNPAID":
      return {
        message:
          "Não conseguimos confirmar o pagamento da sua assinatura. Regularize para reativar o acesso.",
        tone: "danger",
        ctaLabel: "Regularizar pagamento",
      };
    case "INCOMPLETE":
      return {
        message: "O pagamento da sua assinatura ainda não foi concluído. Conclua o pagamento para liberar o acesso.",
        tone: "danger",
        ctaLabel: "Concluir pagamento",
      };
  }
}

// Estados em que o dono pode (e precisa) pagar para continuar: abre o checkout direto na tela de plano.
export function needsPayment(status: BillingStatus): boolean {
  return (
    status === "TRIAL_EXPIRED" ||
    status === "EXPIRED" ||
    status === "PERIOD_ENDED" ||
    status === "CANCELED" ||
    status === "UNPAID" ||
    status === "INCOMPLETE" ||
    status === "PAST_DUE"
  );
}

// O que o dono pode fazer na tela de plano, conforme o estado e a forma de pagamento. Só apresentação: o backend
// recusa o que não vale (ex.: pagar adiantado vários meses).
export type PlanAction = "SUBSCRIBE" | "CURRENT" | "CHANGE" | "RENEW_PIX" | "BLOCKED";

export function planActionFor(billing: BillingStatusResponse, tier: PlanTier, now: number = Date.now()): PlanAction {
  if (!billing.paymentsEnabled || billing.status === "SUSPENDED") return "BLOCKED";
  const sub = billing.subscription;
  if (!sub || sub.courtesy) return "SUBSCRIBE";
  const active = billing.status === "ACTIVE" || billing.status === "PAST_DUE";
  // Troca de plano só com a assinatura em dia e sem cancelamento agendado (o backend recusa o resto).
  const canChange = billing.status === "ACTIVE" && !sub.cancelAtPeriodEnd;
  if (sub.method === "CARD_RECURRING" && active) {
    if (sub.plan.tier === tier) return "CURRENT";
    return canChange ? "CHANGE" : "BLOCKED";
  }
  if (sub.method === "PIX_MONTHLY") {
    const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
    const nearEnd = end === null || end - now <= 10 * 24 * 60 * 60 * 1000;
    // Mês acabando ou acabado: pagar o próximo mês (no plano que escolher) é o caminho.
    if (billing.status !== "ACTIVE" || nearEnd) return "RENEW_PIX";
    if (sub.plan.tier === tier) return "CURRENT";
    return canChange ? "CHANGE" : "BLOCKED";
  }
  return "SUBSCRIBE";
}

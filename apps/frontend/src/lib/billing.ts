// Tipos e regras de cobrança do dashboard. Sem React nem next/*: testável com node --test.
// Tudo aqui é APRESENTAÇÃO. Quem decide acesso, preço e troca de plano é o backend; estes helpers só
// espelham o que ele já responde para a tela mostrar a coisa certa.

export type BillingStatus =
  | "TRIALING"
  | "TRIAL_EXPIRED"
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

export interface BillingStatusResponse {
  status: BillingStatus;
  trialEndsAt: string;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    plan: PlanInfo;
  } | null;
}

export interface PlanChangePreview {
  currentTier: PlanTier;
  newTier: PlanTier;
  direction: "UPGRADE" | "DOWNGRADE";
  newLimit: number | null;
  activeCount: number;
  excess: number;
  professionals: {
    id: string;
    name: string;
    email: string;
    futureAppointments: number;
    canDeactivate: boolean;
  }[];
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
          "Não conseguimos processar o pagamento da sua assinatura. Atualize a forma de pagamento para reativar o acesso.",
        tone: "danger",
        ctaLabel: "Atualizar pagamento",
      };
    case "INCOMPLETE":
      return {
        message: "O pagamento da sua assinatura ainda não foi concluído. Conclua o pagamento para liberar o acesso.",
        tone: "danger",
        ctaLabel: "Concluir pagamento",
      };
  }
}

// O que o botão de CADA card de plano faz, conforme o estado da cobrança:
// - SUBSCRIBE: não há assinatura viva (teste, teste vencido, cancelada, checkout abandonado) -> checkout.
// - CURRENT: é o plano da assinatura ativa.
// - CHANGE: assinatura ativa em outro plano -> troca de plano (com o aviso e a escolha de excedentes).
// - MANAGE_PAYMENT: em atraso/não paga, o backend recusa novo checkout e troca: só o portal resolve.
export type PlanCardAction = "SUBSCRIBE" | "CURRENT" | "CHANGE" | "MANAGE_PAYMENT";

export function planCardAction(billing: BillingStatusResponse, tier: PlanTier): PlanCardAction {
  switch (billing.status) {
    case "ACTIVE":
      return billing.subscription?.plan.tier === tier ? "CURRENT" : "CHANGE";
    case "PAST_DUE":
    case "UNPAID":
      return "MANAGE_PAYMENT";
    default:
      return "SUBSCRIBE";
  }
}

// Verdadeiro quando já existe um customer no Stripe para abrir o portal (há assinatura, viva ou não).
export function canOpenPortal(billing: BillingStatusResponse): boolean {
  return billing.subscription !== null;
}

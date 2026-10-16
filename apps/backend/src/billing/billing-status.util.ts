import { BillingMethod, SubscriptionStatus } from "@marquo/database";

// SUSPENDED = suspensão manual pela plataforma (Tenant.suspendedAt): vence qualquer estado de cobrança.
// EXPIRED = cortesia concedida pela plataforma que chegou ao fim (Subscription.courtesy + currentPeriodEnd).
// PERIOD_ENDED = plano pago por Pix mensal cujo período acabou sem um novo pagamento (o salão "cai").
export type BillingStatus =
  | "TRIALING"
  | "TRIAL_EXPIRED"
  | "SUSPENDED"
  | "EXPIRED"
  | "PERIOD_ENDED"
  | SubscriptionStatus;

// Tolerância depois do fim do período para uma assinatura em atraso (PAST_DUE) antes de bloquear: dá tempo ao
// provedor de repetir a cobrança. Sem isto, uma assinatura "pausada" ficaria com acesso para sempre.
export const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export function computeBillingStatus(
  tenant: { trialEndsAt: Date; suspendedAt?: Date | null },
  subscription: {
    status: SubscriptionStatus;
    courtesy?: boolean;
    method?: BillingMethod | null;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date | null;
  } | null,
  now: number = Date.now(),
): BillingStatus {
  if (tenant.suspendedAt) {
    return "SUSPENDED";
  }
  if (subscription) {
    const periodEnd = subscription.currentPeriodEnd?.getTime() ?? null;
    const periodOver = periodEnd !== null && periodEnd <= now;

    // Cortesia com data de fim vencida: acesso encerrado.
    if (subscription.courtesy && periodOver) return "EXPIRED";

    // Pix mensal: cada pagamento compra UM mês. Acabou o mês sem novo Pix: o acesso termina (não há cobrança
    // automática que renove o currentPeriodEnd).
    if (!subscription.courtesy && subscription.method === "PIX_MONTHLY" && periodOver) return "PERIOD_ENDED";

    // Cancelada com acesso até o fim do que já foi pago: vale até o fim do período, depois bloqueia (nada
    // precisa rodar para isso acontecer).
    if (subscription.status === "ACTIVE" && subscription.cancelAtPeriodEnd && periodOver) return "CANCELED";

    // Em atraso há mais que a tolerância: bloqueia.
    if (
      subscription.status === "PAST_DUE" &&
      !subscription.courtesy &&
      periodEnd !== null &&
      now > periodEnd + PAST_DUE_GRACE_MS
    ) {
      return "UNPAID";
    }
    return subscription.status;
  }
  return tenant.trialEndsAt.getTime() > now ? "TRIALING" : "TRIAL_EXPIRED";
}

// PAST_DUE ainda concede acesso (período de graça durante as novas tentativas de cobrança); os demais estados bloqueiam.
export function hasBillingAccess(status: BillingStatus): boolean {
  return status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE";
}

// Mensagem mostrada quando o guard bloqueia. Uma por estado: "período de teste encerrado" para quem
// cancelou ou está inadimplente confundia o dono sobre o que fazer. Todas apontam para "Plano e cobrança"
// (é lá que o dono assina, paga o próximo Pix ou fala com a equipe).
export function billingBlockMessage(status: BillingStatus): string {
  switch (status) {
    case "SUSPENDED":
      return "Sua conta foi suspensa pela equipe do Marquo. Entre em contato com o suporte para reativar o acesso.";
    case "EXPIRED":
      return "Seu acesso de cortesia terminou. Em Plano e cobrança, escolha um plano para continuar usando o Marquo.";
    case "PERIOD_ENDED":
      return "O mês do seu plano terminou. Em Plano e cobrança, gere o Pix do próximo mês para voltar a usar o Marquo.";
    case "CANCELED":
      return "Sua assinatura foi cancelada. Em Plano e cobrança, assine novamente para voltar a usar o Marquo.";
    case "UNPAID":
      return "Não conseguimos confirmar o pagamento da sua assinatura. Em Plano e cobrança, regularize para reativar o acesso.";
    case "INCOMPLETE":
      return "O pagamento da sua assinatura ainda não foi concluído. Em Plano e cobrança, conclua o pagamento para liberar o acesso.";
    default:
      return "Seu período de teste terminou. Em Plano e cobrança, escolha um plano para continuar usando o Marquo.";
  }
}

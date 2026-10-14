import { SubscriptionStatus } from "@marquo/database";

export type BillingStatus = "TRIALING" | "TRIAL_EXPIRED" | SubscriptionStatus;

export function computeBillingStatus(
  tenant: { trialEndsAt: Date },
  subscription: { status: SubscriptionStatus } | null,
): BillingStatus {
  if (subscription) {
    return subscription.status;
  }
  return tenant.trialEndsAt.getTime() > Date.now() ? "TRIALING" : "TRIAL_EXPIRED";
}

// PAST_DUE ainda concede acesso (grace period durante retries do Stripe); os demais estados bloqueiam.
export function hasBillingAccess(status: BillingStatus): boolean {
  return status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE";
}

// Mensagem mostrada quando o guard bloqueia. Uma por estado: "período de teste encerrado" para quem
// cancelou ou está inadimplente confundia o dono sobre o que fazer.
export function billingBlockMessage(status: BillingStatus): string {
  switch (status) {
    case "CANCELED":
      return "Sua assinatura foi cancelada. Assine novamente para voltar a usar o Marquo.";
    case "UNPAID":
      return "Não conseguimos processar o pagamento da sua assinatura. Atualize a forma de pagamento para reativar o acesso.";
    case "INCOMPLETE":
      return "O pagamento da sua assinatura ainda não foi concluído. Conclua o pagamento para liberar o acesso.";
    default:
      return "Seu período de teste terminou. Assine um plano para continuar usando o Marquo.";
  }
}

// Tipos das respostas do painel da plataforma (GET /platform/*). Só apresentação: quem decide é o backend.
import type { Paginated } from "@marquo/shared-types";

export type PlatformBillingStatus =
  | "TRIALING"
  | "TRIAL_EXPIRED"
  | "SUSPENDED"
  | "EXPIRED"
  | "PERIOD_ENDED"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE"
  | "UNPAID";

export const STATUS_LABEL: Record<PlatformBillingStatus, string> = {
  TRIALING: "Em teste",
  TRIAL_EXPIRED: "Teste vencido",
  SUSPENDED: "Suspenso",
  EXPIRED: "Cortesia encerrada",
  PERIOD_ENDED: "Pix vencido",
  ACTIVE: "Ativo",
  PAST_DUE: "Pagamento em atraso",
  CANCELED: "Cancelado",
  INCOMPLETE: "Pagamento incompleto",
  UNPAID: "Não pago",
};

export const STATUS_TONE: Record<PlatformBillingStatus, "ok" | "warn" | "bad" | "muted"> = {
  TRIALING: "muted",
  TRIAL_EXPIRED: "warn",
  SUSPENDED: "bad",
  EXPIRED: "warn",
  PERIOD_ENDED: "bad",
  ACTIVE: "ok",
  PAST_DUE: "warn",
  CANCELED: "bad",
  INCOMPLETE: "warn",
  UNPAID: "bad",
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dono",
  RECEPTIONIST: "Recepção",
  PROFESSIONAL: "Profissional",
};

export const AUDIT_LABEL: Record<string, string> = {
  TENANT_SUSPENDED: "Negócio suspenso",
  TENANT_REACTIVATED: "Negócio reativado",
  TRIAL_EXTENDED: "Teste estendido",
  TENANT_CREATED: "Negócio criado",
  COUPON_CREATED: "Cupom criado",
  COUPON_UPDATED: "Cupom alterado",
  COURTESY_GRANTED: "Plano de cortesia concedido",
  COURTESY_REMOVED: "Plano de cortesia removido",
  OWNER_PHONE_UPDATED: "Telefone do dono atualizado",
  PASSWORD_RESET_LINK: "Link de redefinição de senha",
  TENANT_PURGED: "Dados do negócio excluídos",
  TRIAL_SET: "Teste grátis definido",
};

export interface PlatformOverview {
  generatedAt: string;
  tenants: {
    total: number;
    listedInMarketplace: number;
    byStatus: { status: PlatformBillingStatus; count: number }[];
    trialsEndingIn7Days: number;
  };
  revenue: {
    mrrCents: number;
    payingTenants: number;
    byPlan: { planName: string; subscribers: number; monthlyCents: number }[];
  };
  signups: { last7Days: number; last30Days: number; series: { date: string; count: number }[] };
  users: { activeByRole: { role: string; count: number }[]; consumers: number };
  activity: { appointmentsCreatedLast30Days: number };
}

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  // Só dígitos, sem DDI 55; nulo em contas antigas.
  ownerPhone: string | null;
  billingStatus: PlatformBillingStatus;
  planName: string | null;
  courtesy: boolean;
  courtesyEndsAt: string | null;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  suspendedAt: string | null;
  listedInMarketplace: boolean;
}

export interface PlatformTenantDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  trialEndsAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  description: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  listedInMarketplace: boolean;
  billingStatus: PlatformBillingStatus;
  subscription: {
    status: string;
    courtesy: boolean;
    method: "CARD_RECURRING" | "PIX_MONTHLY" | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    plan: { name: string; tier: string; priceCents: number };
  } | null;
  users: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
  counts: { appointments: number; clients: number; professionals: number; services: number };
  coupon: { code: string; kind: CouponKind; value: number; redeemedAt: string } | null;
  audit: { id: string; action: string; actor: string; detail: string | null; createdAt: string }[];
}

export type CouponKind = "TRIAL_DAYS" | "PERCENT" | "FIXED_CENTS";
export type CouponState = "ACTIVE" | "DISABLED" | "NOT_STARTED" | "EXPIRED" | "EXHAUSTED";

export const COUPON_KIND_LABEL: Record<CouponKind, string> = {
  TRIAL_DAYS: "Dias extras de teste",
  PERCENT: "Desconto (%)",
  FIXED_CENTS: "Desconto fixo (R$)",
};

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  ACTIVE: "Ativo",
  DISABLED: "Desativado",
  NOT_STARTED: "Ainda não começou",
  EXPIRED: "Expirado",
  EXHAUSTED: "Esgotado",
};

export interface PlatformCouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  description: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
  state: CouponState;
}

export interface PlatformUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
}

export const METHOD_LABEL = {
  CARD_RECURRING: "Cartão recorrente",
  PIX_MONTHLY: "Pix mensal",
} as const;

export interface PlatformSubscriptionRow {
  id: string;
  status: string;
  courtesy: boolean;
  method: "CARD_RECURRING" | "PIX_MONTHLY" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  plan: { name: string; priceCents: number };
  tenant: { id: string; name: string; slug: string; suspendedAt: string | null };
}

export interface PlatformAuditRow {
  id: string;
  action: string;
  actor: string;
  detail: string | null;
  tenantId: string | null;
  createdAt: string;
}

export type PlatformPage<T> = Paginated<T>;

// Exclusão de dados (promessa dos termos: 90 dias depois do fim do acesso). Só apresentação: o backend decide tudo.
export interface PlatformDeletionCandidate {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  billingStatus: PlatformBillingStatus;
  accessEndedAt: string | null;
  eligible: boolean;
  eligibleOn: string | null;
}

export interface PlatformDeletionPreview {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  billingStatus: PlatformBillingStatus;
  accessEndedAt: string | null;
  deletable: boolean;
  eligible: boolean;
  eligibleOn: string | null;
  retentionDays: number;
  counts: {
    users: number;
    professionals: number;
    clients: number;
    appointments: number;
    tickets: number;
    products: number;
    financialEntries: number;
    reviews: number;
    intakeResponses: number;
    galleryImages: number;
  };
}

export const DELETION_COUNT_LABEL: Record<keyof PlatformDeletionPreview["counts"], string> = {
  users: "Usuários (dono e equipe)",
  professionals: "Profissionais",
  clients: "Clientes",
  appointments: "Agendamentos",
  tickets: "Comandas",
  products: "Produtos",
  financialEntries: "Lançamentos financeiros",
  reviews: "Avaliações",
  intakeResponses: "Fichas de anamnese respondidas",
  galleryImages: "Fotos da galeria",
};

// Teste grátis: só negócios sem assinatura. `daysLeft` já vem calculado pelo backend (negativo = venceu há N dias).
export interface PlatformTrialItem {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  trialEndsAt: string;
  daysLeft: number;
  expired: boolean;
  suspended: boolean;
  owner: { name: string; email: string; phone: string | null } | null;
}

export function trialRemainingLabel(item: Pick<PlatformTrialItem, "daysLeft" | "expired">): string {
  if (item.expired) {
    const ago = Math.abs(item.daysLeft);
    return ago === 0 ? "Venceu hoje" : `Venceu há ${ago} dia${ago === 1 ? "" : "s"}`;
  }
  return item.daysLeft === 1 ? "Falta 1 dia" : `Faltam ${item.daysLeft} dias`;
}

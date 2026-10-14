// Versão vigente dos Termos de Uso e da Política de Privacidade (data da última alteração de texto).
// O frontend envia a versão que o usuário viu ao aceitar no cadastro; o backend só aceita se for
// IGUAL a esta, então mudar o texto sem trocar a versão (ou o contrário) é erro. Ao alterar os
// documentos, atualize esta constante junto com o texto em apps/frontend/src/lib/legal-content.ts.
export const LEGAL_DOCS_VERSION = "2026-10-14";

// Resposta padrão de qualquer listagem paginada (backend: common/pagination/paginate.ts).
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface PublicGalleryImage {
  id: string;
  url: string;
}

export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  businessHours: string | null;
  logoUrl: string | null;
  updatedAt: string;
  accentColor: string | null;
  whatsappNumber: string | null;
  instagramUrl: string | null;
  showServices: boolean;
  showTeam: boolean;
  showGallery: boolean;
  showContact: boolean;
  galleryImages: PublicGalleryImage[];
}

export interface UpdateTenantProfileInput {
  description?: string;
  address?: string;
  businessHours?: string;
  accentColor?: string;
  whatsappNumber?: string;
  instagramUrl?: string;
  showServices?: boolean;
  showTeam?: boolean;
  showGallery?: boolean;
  showContact?: boolean;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

export interface PublicProfessional {
  id: string;
  name: string;
  bio: string | null;
}

export interface AvailableSlot {
  startAt: string;
  endAt: string;
}

// Quem agenda NÃO vai no payload: a identidade é a do Consumer autenticado (cookie de sessão),
// e o backend deriva o Client do tenant a partir dela.
export interface CreateBookingInput {
  professionalId: string;
  serviceId: string;
  startAt: string;
}

export type StaffRole = "OWNER" | "RECEPTIONIST" | "PROFESSIONAL";

export type Weekday =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

export interface CalendarProfessional {
  id: string;
  name: string;
  slotGranularityMinutes: number;
  workingHours: Array<{ weekday: Weekday; startMinute: number; endMinute: number }>;
}

export interface CalendarTimeBlock {
  id: string;
  professionalId: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface CalendarResponse {
  professionals: CalendarProfessional[];
  appointments: PublicBooking[];
  timeBlocks: CalendarTimeBlock[];
}

export interface CreateStaffAppointmentInput {
  professionalId: string;
  startAt: string;
  items: Array<{ serviceId: string }>;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  notes?: string;
  status?: "SCHEDULED" | "CONFIRMED";
}

// ── M5: marketplace de descoberta ──

export interface MarketplaceCategory {
  id: string;
  slug: string;
  name: string;
  position: number;
}

export interface MarketplaceRating {
  average: number | null;
  count: number;
}

export interface MarketplaceResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  neighborhood: string | null;
  priceRange: number | null;
  logoUrl: string | null;
  categories: Array<{ name: string; slug: string }>;
  rating: MarketplaceRating;
  distanceKm: number | null;
}

export interface MarketplaceEstablishment {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  businessHours: string | null;
  priceRange: number | null;
  logoUrl: string | null;
  whatsappNumber: string | null;
  instagramUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: Array<{ name: string; slug: string }>;
  galleryImages: Array<{ id: string; url: string }>;
  services: Array<{ id: string; name: string; durationMinutes: number; priceCents: number }>;
  rating: MarketplaceRating;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    authorName: string;
  }>;
}

export interface MarketplaceSettings {
  listedInMarketplace: boolean;
  city: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  priceRange: number | null;
  categorySlugs: string[];
  availableCategories: MarketplaceCategory[];
}

export type ConsumerLoginStatus = "register" | "needs_password_setup" | "password_required";

export interface ConsumerProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export type ConsumerMe = ConsumerProfile;

export interface ConsumerEstablishment {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface ConsumerSession {
  accessToken: string;
  consumer: { id: string; name: string; phone: string; email: string | null };
}

// Uma linha da lista "Dispositivos conectados" em /minha-conta — não confundir com
// ConsumerSession acima (a resposta de login/refresh).
export interface ConsumerDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface OwnerReview {
  id: string;
  rating: number;
  comment: string | null;
  status: "VISIBLE" | "HIDDEN" | "PENDING_REPORT";
  createdAt: string;
  consumer: { name: string };
}

export interface ReviewablePastAppointment {
  id: string;
  startAt: string;
  tenant: { name: string; slug: string };
  items: Array<{ service: { name: string } }>;
}

// ── M4: financeiro ──

export type FinancialDirection = "INCOME" | "EXPENSE";
export type FinancialEntryStatus = "PENDING" | "PAID" | "CANCELED";
export type FinancialEntrySource = "TICKET" | "COMMISSION" | "MANUAL";

export interface FinancialCategory {
  id: string;
  name: string;
  direction: FinancialDirection;
  parentId: string | null;
  isArchived: boolean;
}

export interface FinancialEntry {
  id: string;
  direction: FinancialDirection;
  status: FinancialEntryStatus;
  source: FinancialEntrySource;
  description: string;
  amountCents: number;
  categoryId: string | null;
  category?: { name: string } | null;
  counterparty: string | null;
  ticketId: string | null;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

export interface FinanceOverview {
  receivableCents: number;
  receivableOverdueCents: number;
  payableCents: number;
  payableOverdueCents: number;
  monthIncomeCents: number;
  monthExpenseCents: number;
  monthNetCents: number;
}

export interface CashFlowReport {
  basis: "due" | "paid";
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  byCategory: Array<{ name: string; direction: FinancialDirection; totalCents: number }>;
}

export interface DreReport {
  revenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  expensesCents: number;
  expensesByCategory: Array<{ name: string; totalCents: number }>;
  resultCents: number;
}

export interface OpenItemsReport {
  totalCents: number;
  overdueCents: number;
  entries: Array<{
    id: string;
    description: string;
    counterparty: string | null;
    categoryName: string | null;
    amountCents: number;
    dueDate: string;
    overdueDays: number;
  }>;
}

// ── M3: comanda / PDV / estoque / comissão ──

export type TicketStatus = "OPEN" | "CLOSED" | "CANCELED";
export type PaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "PIX" | "OTHER";
export type TicketItemKind = "SERVICE" | "PRODUCT" | "CUSTOM";

export interface AdminProduct {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  costCents: number | null;
  isActive: boolean;
  stock: number;
}

export interface StockMovement {
  id: string;
  kind: "IN" | "OUT" | "ADJUSTMENT" | "SALE";
  quantity: number;
  note: string | null;
  createdAt: string;
}

export interface TicketItem {
  id: string;
  kind: TicketItemKind;
  serviceId: string | null;
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  /** Quando o item entrou na comanda (registro de data). */
  createdAt: string;
  professional: { id: string | null; name: string } | null;
}

export interface TicketPayment {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  createdAt: string;
}

export interface Ticket {
  id: string;
  status: TicketStatus;
  appointmentId: string | null;
  client: { id: string; name: string; phone: string } | null;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
  canceledAt: string | null;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  items: TicketItem[];
  payments: TicketPayment[];
}

export interface CommissionRule {
  id: string;
  professionalId: string;
  base: "SERVICE" | "PRODUCT" | "ALL";
  targetId: string | null;
  kind: "PERCENT" | "FIXED";
  value: number;
  isActive: boolean;
}

export interface CommissionReport {
  totalCents: number;
  byProfessional: Array<{
    professionalId: string;
    name: string;
    totalCents: number;
    count: number;
  }>;
  entries: Array<{
    id: string;
    professionalName: string;
    description: string;
    baseCents: number;
    amountCents: number;
    createdAt: string;
  }>;
}

// Faturamento por profissional num período (comandas FECHADAS no intervalo). Tudo em centavos.
//  - grossCents: Σ preço × quantidade dos itens atribuídos a ele (antes do desconto)
//  - discountCents: parte do desconto da comanda rateada proporcionalmente aos itens
//  - netCents: grossCents − discountCents
//  - commissionCents: repasse (comissão) gerado no período — calculada sobre o bruto
//  - houseCents: o que sobra pro estabelecimento (netCents − commissionCents)
//  - payableBalanceCents: ACUMULADO de todo o histórico (comissões − repasses já pagos), não do período
export interface ProfessionalEarnings {
  professionalId: string;
  name: string;
  isActive: boolean;
  ticketCount: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
  commissionCents: number;
  houseCents: number;
  payableBalanceCents: number;
}

export interface EarningsReport {
  from: string;
  to: string;
  professionals: ProfessionalEarnings[];
  totals: Omit<ProfessionalEarnings, "professionalId" | "name" | "isActive">;
}

export interface CommissionPayout {
  id: string;
  professionalId: string;
  professionalName: string;
  amountCents: number;
  note: string | null;
  createdAt: string;
}

export interface CashRegisterSummary {
  open: boolean;
  register?: {
    id: string;
    openingFloatCents: number;
    openedAt: string;
  };
  movements?: Array<{
    id: string;
    kind: "OPENING" | "SALE" | "WITHDRAWAL" | "DEPOSIT";
    amountCents: number;
    note: string | null;
    createdAt: string;
  }>;
  paymentsByMethod?: Array<{ method: PaymentMethod; totalCents: number }>;
  expectedCashCents?: number;
}

export interface AdminClientListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  createdAt: string;
  _count: { appointments: number };
}

export interface ClientIntakeResponse {
  id: string;
  formId: string;
  answers: Record<string, string | boolean>;
  updatedAt: string;
  form: { id: string; name: string; fields: IntakeFieldDef[] };
}

export interface IntakeFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "boolean" | "select";
  options?: string[];
  required?: boolean;
}

export interface AdminClientDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  cpf: string | null;
  notes: string | null;
  tags: string[];
  createdAt: string;
  appointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: AppointmentStatus;
    professional: { user: { name: string } };
    items: Array<{ id: string; service: { name: string }; priceCentsSnapshot: number }>;
  }>;
  intakeResponses: ClientIntakeResponse[];
  /** Comandas do cliente (mais recentes primeiro; sem as canceladas). */
  tickets: Array<{
    id: string;
    status: TicketStatus;
    openedAt: string;
    closedAt: string | null;
    totalCents: number;
    items: Array<{ id: string; description: string; quantity: number; totalCents: number }>;
  }>;
}

export interface IntakeFormSummary {
  id: string;
  name: string;
  fields: IntakeFieldDef[];
  isActive: boolean;
}

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "IN_SERVICE"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELED";

export interface AppointmentItem {
  id: string;
  serviceId: string;
  serviceName: string;
  position: number;
  durationMinutes: number;
  priceCentsSnapshot: number;
}

// Nome mantido (`PublicBooking`) por compatibilidade com o front atual. `priceCentsSnapshot`
// = soma dos itens; `service` = primeiro item (atalho legado). O agregado real são os `items`.
export interface PublicBooking {
  id: string;
  professionalId: string;
  // Atalho legado = serviço do primeiro item. Sempre presente (todo atendimento tem 1+ item).
  serviceId: string;
  clientName: string;
  clientPhone: string;
  startAt: string;
  endAt: string;
  priceCentsSnapshot: number;
  status: AppointmentStatus;
  source?: "PUBLIC" | "STAFF";
  notes?: string | null;
  rescheduledCount: number;
  items?: AppointmentItem[];
  service?: { name: string };
  professional?: { id: string; user: { name: string } };
  tenant?: { slug: string; name: string };
}

export interface CreateWaitlistInput {
  serviceId: string;
  professionalId?: string;
  preferredDate?: string;
  notes?: string;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// CATÁLOGO DE PLANOS — a ÚNICA definição de preço e limite do Marquo.
//
// Para mudar um preço ou limite: edite AQUI, faça o deploy, e crie o Price novo no Stripe (o valor de um Price é
// imutável) apontando STRIPE_PRICE_<TIER> para ele. Quem consome este arquivo:
//   - backend: PlanCatalogService grava a tabela `Plan` a partir dele a cada boot, e confere que o Price do Stripe
//     tem o mesmo valor antes de cobrar (checkout e troca de plano falham fechado se divergir);
//   - seed do banco (packages/database/prisma/seed.ts);
//   - frontend: só o texto de apresentação (`audience`); os PREÇOS o app lê de GET /plans, nunca daqui;
//   - site institucional (outro repo): lê GET /plans e usa uma cópia como fallback offline, só para quando a API
//     estiver fora do ar. Ao mudar aqui, atualize também essa cópia (TotalSoftware/src/data/produtos.ts).
//
// Dinheiro em CENTAVOS inteiros (regra do projeto). `maxProfessionals: null` = ilimitado.
// A migration `seed_plans` tem valores antigos de propósito (histórica): o sync do boot corrige o banco.

export type PlanCatalogTier = "ESSENCIAL" | "PROFISSIONAL" | "PREMIUM";

export interface PlanCatalogEntry {
  readonly tier: PlanCatalogTier;
  readonly name: string;
  readonly priceCents: number;
  readonly maxProfessionals: number | null;
  // Frase de apresentação (cadastro e tela de plano). Só texto: não afeta cobrança nem limites.
  readonly audience: string;
}

export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    tier: "ESSENCIAL",
    name: "Essencial",
    priceCents: 4990,
    maxProfessionals: 2,
    audience: "Para quem trabalha sozinho ou em dupla.",
  },
  {
    tier: "PROFISSIONAL",
    name: "Profissional",
    priceCents: 9990,
    maxProfessionals: 5,
    audience: "Para salões e barbearias com equipe pequena.",
  },
  {
    tier: "PREMIUM",
    name: "Premium",
    priceCents: 18990,
    maxProfessionals: null,
    audience: "Para equipes grandes e negócios em crescimento.",
  },
];

// O Price do Stripe tem que ser exatamente isto para o valor cobrado ser o valor mostrado.
export const PLAN_CURRENCY = "brl";
export const PLAN_INTERVAL = "month";

export function planCatalogEntry(tier: string): PlanCatalogEntry | undefined {
  return PLAN_CATALOG.find((plan) => plan.tier === tier);
}

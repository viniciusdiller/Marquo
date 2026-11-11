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
  latitude?: number | null;
  longitude?: number | null;
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

export type TenantSetupStepId =
  | "services"
  | "professionals"
  | "working_hours"
  | "service_links"
  | "location"
  | "contact";

export interface TenantSetupStep {
  id: TenantSetupStepId;
  title: string;
  description: string;
  isComplete: boolean;
  href: string;
  importance: "critical" | "recommended";
}

export interface TenantSetupStatus {
  isFullySetup: boolean;
  isReadyForBooking: boolean;
  completedStepsCount: number;
  totalStepsCount: number;
  slug: string;
  steps: TenantSetupStep[];
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
  // Caminho servido pelo backend (prefixar com a origem da API); nulo = sem foto.
  photoUrl: string | null;
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
  slug?: string;
  listedInMarketplace: boolean;
  address?: string | null;
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
  /** Quanto deste item o clube de assinaturas cobre (aberta: previsão do servidor; fechada: o que foi baixado). */
  clubCoveredUnits: number;
  clubCoveredCents: number;
  /** Quando o item entrou na comanda (registro de data). */
  createdAt: string;
  professional: { id: string | null; name: string } | null;
}

export type TicketAuditAction = "ITEM_UPDATED" | "PAYMENT_REMOVED" | "REOPENED";

/** Histórico de alterações da comanda (só o dono vê): quem mexeu em dinheiro já lançado, e por quê. */
export interface TicketAuditEntry {
  id: string;
  action: TicketAuditAction;
  actorName: string;
  reason: string | null;
  detail: string;
  createdAt: string;
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
  /** Valor dos serviços cobertos pelo clube de assinaturas (já abatido do total; 0 se o cliente não é membro). */
  clubCoveredCents: number;
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

export type WaitlistStatusValue = "PENDING" | "CONTACTED" | "RESOLVED" | "CANCELED";

// Uma linha da lista de espera como o painel do negócio recebe (só o que a tela usa).
export interface WaitlistEntryAdmin {
  id: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  professionalName: string | null;
  preferredDate: string | null;
  notes: string | null;
  status: WaitlistStatusValue;
  createdAt: string;
}

// Contagem das abas: aguardando, contatados e encerrados (resolvidos + cancelados).
export interface WaitlistCounts {
  pending: number;
  contacted: number;
  closed: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// CATÁLOGO DE PLANOS — a ÚNICA definição de preço e limite do Marquo.
//
// Para mudar um preço ou limite: edite AQUI e faça o deploy. Quem já assina segue no valor antigo até o provedor
// de pagamento (Mercado Pago, a integrar) ser atualizado: com clientes reais, reajuste com migração deliberada.
// Quem consome este arquivo:
//   - backend: PlanCatalogService grava a tabela `Plan` a partir dele a cada boot;
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
  // Clube de assinaturas (pacotes mensais do negócio para os clientes). Recurso por plano: o servidor confere
  // (`planIncludesClub`), a tela só mostra. No período de teste (sem assinatura) vale o Essencial, ou seja, sem clube.
  readonly subscriptionClub: boolean;
}

export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    tier: "ESSENCIAL",
    name: "Essencial",
    priceCents: 4990,
    maxProfessionals: 2,
    audience: "Para quem trabalha sozinho ou em dupla.",
    subscriptionClub: false,
  },
  {
    tier: "PROFISSIONAL",
    name: "Profissional",
    priceCents: 9990,
    maxProfessionals: 5,
    audience: "Para salões e barbearias com equipe pequena.",
    subscriptionClub: true,
  },
  {
    tier: "PREMIUM",
    name: "Premium",
    priceCents: 18990,
    maxProfessionals: null,
    audience: "Para equipes grandes e negócios em crescimento.",
    subscriptionClub: true,
  },
];

// Moeda e recorrência dos planos (o valor cobrado tem que ser o valor mostrado).
export const PLAN_CURRENCY = "brl";
export const PLAN_INTERVAL = "month";

export function planCatalogEntry(tier: string): PlanCatalogEntry | undefined {
  return PLAN_CATALOG.find((plan) => plan.tier === tier);
}

// O plano inclui o clube de assinaturas? Tier desconhecido = não (nunca libera por engano).
export function planIncludesClub(tier: string | null | undefined): boolean {
  return !!tier && planCatalogEntry(tier)?.subscriptionClub === true;
}

// ---- Clube de assinaturas (pacotes mensais de serviços) ----
// O dono cria pacotes ("4 cortes por mês"), inscreve clientes e marca o mês como pago (o pagamento acontece fora do
// sistema). Ao fechar a comanda de um membro, os serviços do pacote saem sem cobrança até acabarem os usos do mês.
export const CLUB_MAX_USES_PER_MONTH = 60;
export const CLUB_MAX_PLAN_SERVICES = 30;
export const CLUB_MAX_PRICE_CENTS = 1_000_000; // R$ 10.000,00 por mês

export type ClubMembershipStatus = "ACTIVE" | "CANCELED";
// Estado mostrado ao dono: "EXPIRED" é decidido na leitura (mês pago acabou e ninguém renovou).
export type ClubMembershipState = "ACTIVE" | "EXPIRED" | "CANCELED";

export interface ClubPlanSummary {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  usesPerMonth: number;
  isActive: boolean;
  services: Array<{ id: string; name: string }>;
  activeMembers: number;
}

export interface ClubMemberSummary {
  id: string;
  state: ClubMembershipState;
  planName: string;
  client: { id: string; name: string; phone: string };
  usesPerMonth: number;
  usesInPeriod: number;
  usesRemaining: number;
  periodStart: string;
  periodEnd: string;
  priceCents: number;
  // Dá para marcar o próximo mês como pago agora? (o servidor decide: só perto do fim do mês pago, ou depois dele)
  canRenew: boolean;
}

export interface ClubOverview {
  // O negócio ainda está no período de teste (sem assinatura)? O teste usa o plano de entrada, que não tem clube.
  onTrial: boolean;
  // Nome do plano assinado (nulo no teste); só para a tela explicar por que o clube está bloqueado.
  planName: string | null;
  // O plano do negócio inclui o clube?
  planAllowsClub: boolean;
  // O dono ligou o clube? (só vale se o plano permitir)
  enabled: boolean;
}

// ---- Perfis de acesso (o que cada pessoa da equipe vê e faz no painel) ----
// O PAPEL do usuário (dono, equipe, profissional) continua existindo: define o escopo (profissional só vê a própria agenda) e o
// dono é sempre total. O que cada pessoa acessa vem do PERFIL: um nível por área (sem acesso, só ver, ver e editar). O servidor
// confere SEMPRE (AreaGuard); esconder o item do menu é só conforto.
//
// Fica FORA dos perfis, sempre só do dono: Plano e cobrança (paga o Marquo), Configurações (dados do negócio) e Perfis de acesso
// (quem tem acesso). Um perfil nunca consegue se dar mais poder nem cancelar a assinatura.
export const ACCESS_AREAS = [
  { key: "agenda", label: "Agenda", group: "Operação do dia", hint: "Ver a agenda e marcar, remarcar e cancelar atendimentos e bloqueios." },
  { key: "comandas", label: "Comandas", group: "Operação do dia", hint: "Abrir, editar, receber e fechar comandas. Reabrir comanda fechada é só do dono." },
  { key: "caixa", label: "Caixa", group: "Operação do dia", hint: "Abrir e fechar o caixa e lançar entradas e saídas." },
  { key: "lista_espera", label: "Lista de espera", group: "Operação do dia", hint: "Ver quem espera um horário e dar andamento." },
  { key: "clientes", label: "Clientes", group: "Clientes", hint: "Cadastro e histórico dos clientes." },
  { key: "fichas", label: "Fichas", group: "Clientes", hint: "Só ver: consulta e preenche as fichas no atendimento. Editar: também cria e altera os modelos." },
  { key: "clube", label: "Clube de assinaturas", group: "Clientes", hint: "Pacotes mensais, adesões e renovações." },
  { key: "servicos", label: "Serviços", group: "Catálogo", hint: "Catálogo de serviços, preços e durações." },
  { key: "produtos", label: "Produtos", group: "Catálogo", hint: "Catálogo e estoque dos produtos." },
  { key: "profissionais", label: "Profissionais", group: "Equipe e financeiro", hint: "Cadastrar e editar a equipe, horários e serviços de cada um." },
  { key: "comissoes", label: "Comissões", group: "Equipe e financeiro", hint: "Ver ganhos por profissional. Editar: também as regras de comissão." },
  { key: "financeiro", label: "Financeiro", group: "Equipe e financeiro", hint: "Lançamentos, contas a pagar e receber e fluxo de caixa." },
  { key: "financeiro_avancado", label: "Financeiro avançado", group: "Equipe e financeiro", hint: "Resultado (DRE), categorias e repasse de comissões." },
  { key: "relatorios", label: "Relatórios", group: "Equipe e financeiro", hint: "Balanço geral de serviços e produtos." },
  { key: "marketplace", label: "Marketplace", group: "Negócio", hint: "Aparecer na busca, localização e avaliações." },
] as const;

export type AccessAreaKey = (typeof ACCESS_AREAS)[number]["key"];
export const ACCESS_AREA_KEYS: readonly AccessAreaKey[] = ACCESS_AREAS.map((a) => a.key);

// Áreas que só o dono acessa (não existem como opção de perfil).
export const OWNER_ONLY_AREAS = ["Plano e cobrança", "Configurações", "Perfis de acesso"] as const;

export type AccessLevel = "NONE" | "VIEW" | "EDIT";
export const ACCESS_LEVELS: readonly AccessLevel[] = ["NONE", "VIEW", "EDIT"];
export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = { NONE: "Sem acesso", VIEW: "Só ver", EDIT: "Ver e editar" };

export type AccessPermissions = Record<AccessAreaKey, AccessLevel>;

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as readonly string[]).includes(value);
}

export function isAccessAreaKey(value: unknown): value is AccessAreaKey {
  return typeof value === "string" && (ACCESS_AREA_KEYS as readonly string[]).includes(value);
}

const LEVEL_RANK: Record<AccessLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2 };

// O nível `have` cobre o exigido `need`? (EDIT cobre VIEW; NONE nunca cobre nada além de NONE)
export function levelAtLeast(have: AccessLevel | undefined, need: AccessLevel): boolean {
  return LEVEL_RANK[have ?? "NONE"] >= LEVEL_RANK[need];
}

// Qualquer entrada (JSON do banco, corpo de requisição) vira um mapa completo e VÁLIDO: área desconhecida some, nível inválido ou
// ausente vira NONE. Nunca confia no que veio: o pior caso é a pessoa perder acesso, nunca ganhar.
export function normalizePermissions(input: unknown): AccessPermissions {
  const source = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const result = {} as AccessPermissions;
  for (const key of ACCESS_AREA_KEYS) {
    const value = source[key];
    result[key] = isAccessLevel(value) ? value : "NONE";
  }
  return result;
}

export const FULL_ACCESS: AccessPermissions = normalizePermissions(Object.fromEntries(ACCESS_AREA_KEYS.map((k) => [k, "EDIT"])));

// Perfis que todo negócio recebe, iguais ao que cada papel já podia fazer ANTES dos perfis existirem: nada muda até o dono mexer.
export const DEFAULT_PROFILES = [
  {
    name: "Recepção",
    role: "RECEPTIONIST",
    description: "Atendimento do dia a dia: agenda, comandas, caixa e clientes.",
    permissions: normalizePermissions({
      agenda: "EDIT", comandas: "EDIT", caixa: "EDIT", lista_espera: "EDIT", clientes: "EDIT", fichas: "VIEW",
      servicos: "VIEW", produtos: "EDIT", profissionais: "VIEW", financeiro: "EDIT", relatorios: "VIEW",
    }),
  },
  {
    name: "Profissional",
    role: "PROFESSIONAL",
    description: "Quem atende: a própria agenda, fichas e o catálogo para consulta.",
    permissions: normalizePermissions({ agenda: "EDIT", fichas: "VIEW", servicos: "VIEW", profissionais: "VIEW" }),
  },
] as const;

export type StaffKind = "OWNER" | "RECEPTIONIST" | "PROFESSIONAL";

// Perfil padrão por papel, para quem ainda não tem perfil atribuído (conta antiga ou criada por outro caminho).
export function defaultPermissionsForRole(role: string): AccessPermissions {
  if (role === "OWNER") return FULL_ACCESS;
  const profile = DEFAULT_PROFILES.find((p) => p.role === role);
  return profile ? profile.permissions : normalizePermissions({});
}

export interface AccessMe {
  role: StaffKind;
  isOwner: boolean;
  profileName: string | null;
  permissions: AccessPermissions;
}

export interface AccessProfileSummary {
  id: string;
  name: string;
  description: string | null;
  permissions: AccessPermissions;
  usersCount: number;
}

export interface AccessUserSummary {
  id: string;
  name: string;
  email: string;
  role: StaffKind;
  isActive: boolean;
  profile: { id: string; name: string } | null;
}

// Escolha de plano no cadastro. Sem React nem next/*: testável com node --test.
//
// IMPORTANTE: é só uma INTENÇÃO de apresentação. O cadastro não recebe plano nenhum (o backend define papel,
// trial e limites; ver SignupDto), ninguém é cobrado no cadastro e o plano só passa a valer quando o dono
// tiver um plano ativado em /dashboard/plano. Aqui a escolha serve para (1) mostrar ao visitante o que
// cada plano oferece antes de criar a conta e (2) destacar a opção que ele escolheu na tela de plano.
import type { PlanTier } from "./billing";

export const PLAN_COOKIE = "ta_plan";
export const PLAN_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;
export const TRIAL_DAYS_LABEL = "14 dias";

const TIERS: readonly PlanTier[] = ["ESSENCIAL", "PROFISSIONAL", "PREMIUM"];

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

// `?plano=` vem da URL (o site institucional manda o NOME: "Essencial", "Profissional", "Premium"; o app pode
// mandar o tier). Aceita os dois, sem diferenciar caixa/acento; qualquer outra coisa é ignorada (null).
export function parsePlanParam(value: string | string[] | undefined | null): PlanTier | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 40) return null;
  const folded = fold(raw);
  return isPlanTier(folded) ? folded : null;
}

// Só o tier e só se for um dos três: o valor do cookie é lido no servidor e nunca é confiável.
export function parsePlanCookie(value: string | undefined | null): PlanTier | null {
  return value && isPlanTier(value) ? value : null;
}

// Tudo é igual entre os planos, menos o tamanho da equipe (backend: Plan.maxProfessionals). Por isso o texto
// de cada plano fala de equipe, e não de recursos que os outros "não têm". A frase de apresentação de cada plano
// (`audience`) vem do catálogo único (@marquo/shared-types); os PREÇOS vêm de GET /plans, nunca daqui.
export function teamLabel(maxProfessionals: number | null): string {
  if (maxProfessionals === null) return "Profissionais ilimitados";
  if (maxProfessionals === 1) return "1 profissional";
  return `Até ${maxProfessionals} profissionais`;
}

// Incluído em TODOS os planos (as telas existem no painel; nenhum plano as remove).
export const INCLUDED_IN_ALL_PLANS = [
  "Agenda online com o link do seu negócio",
  "Clientes, fichas de anamnese e lista de espera",
  "Comandas, caixa e financeiro",
  "Comissões por profissional",
] as const;

export function planCookieValue(tier: PlanTier): string {
  return `${PLAN_COOKIE}=${tier}; path=/; max-age=${PLAN_COOKIE_MAX_AGE_S}; samesite=lax`;
}

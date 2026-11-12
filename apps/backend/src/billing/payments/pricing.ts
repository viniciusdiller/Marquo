import { CouponKind } from "@marquo/database";
import { DateTime } from "luxon";

// Menor valor que cobramos numa tentativa. Cupom nenhum deixa a cobrança abaixo disto: o provedor (Asaas) tem valor
// mínimo por transação e uma cobrança de centavos não vale a tentativa.
export const MIN_CHARGE_CENTS = 500;
// Teto de um plano mensal definido pelo painel: barra o zero a mais por engano (R$ 49,90 digitado como R$ 499,00).
export const MAX_PLAN_PRICE_CENTS = 100_000;

export interface PriceQuote {
  listPriceCents: number;
  discountCents: number;
  chargeCents: number;
}

// Preço da PRIMEIRA cobrança com o cupom (os meses seguintes são sempre o preço cheio). Tudo em centavos
// inteiros; o desconto nunca passa do preço e a cobrança nunca fica abaixo de MIN_CHARGE_CENTS.
export function priceWithCoupon(
  listPriceCents: number,
  coupon: { kind: CouponKind; value: number } | null,
): PriceQuote {
  let discount = 0;
  if (coupon?.kind === CouponKind.PERCENT) {
    discount = Math.round((listPriceCents * coupon.value) / 100);
  } else if (coupon?.kind === CouponKind.FIXED_CENTS) {
    discount = coupon.value;
  }
  // TRIAL_DAYS não é desconto de cobrança: vale só no cadastro.
  const maxDiscount = Math.max(0, listPriceCents - MIN_CHARGE_CENTS);
  discount = Math.max(0, Math.min(discount, maxDiscount));
  return { listPriceCents, discountCents: discount, chargeCents: listPriceCents - discount };
}

// Reais com 2 casas para o Asaas (a API recebe decimal). Sem aritmética de ponto flutuante: sai de
// centavos inteiros.
export function centsToReais(cents: number): number {
  return Number((Math.round(cents) / 100).toFixed(2));
}

export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

// Um mês de calendário a partir de `base` (31/01 + 1 mês = 28/02), no fuso do negócio para o "dia do mês" não
// escorregar com a virada de UTC.
export function addOneMonth(base: Date): Date {
  return DateTime.fromJSDate(base, { zone: "America/Sao_Paulo" }).plus({ months: 1 }).toJSDate();
}

// Início do próximo período ao pagar um Pix: quem paga ANTES do vencimento não perde os dias que sobraram
// (soma a partir do fim atual); quem paga depois começa de agora.
export function nextPeriodStart(currentPeriodEnd: Date | null, now: Date = new Date()): Date {
  if (currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) return currentPeriodEnd;
  return now;
}

// Data civil (yyyy-MM-dd) no fuso do negócio, que é como o Asaas recebe `dueDate`/`nextDueDate`.
export function asaasDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "America/Sao_Paulo" }).toFormat("yyyy-MM-dd");
}

// Data e hora (yyyy-MM-dd HH:mm:ss) no fuso do negócio, formato do `subscription.nextDueDate` do Checkout do Asaas.
export function asaasDateTime(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "America/Sao_Paulo" }).toFormat("yyyy-MM-dd HH:mm:ss");
}

// O Asaas devolve datas civis ("2026-11-12"). Lidas como meio-dia em São Paulo: o dia não escorrega com UTC.
export function parseAsaasDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = DateTime.fromISO(value.slice(0, 10), { zone: "America/Sao_Paulo" }).set({ hour: 12 });
  return parsed.isValid ? parsed.toJSDate() : null;
}

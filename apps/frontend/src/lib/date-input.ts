// Conversões puras entre o texto dos campos de data/hora (yyyy-MM-dd, HH:mm) e Date/partes. Sem React, testável com node --test.
// Tudo no relógio LOCAL do navegador (o campo é só um valor de calendário, sem fuso): o fuso do negócio é aplicado pelo
// servidor ao interpretar o texto, como já era com o <input type="date">.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

export function parseISODate(value: string | null | undefined): Date | undefined {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return undefined;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  // 2026-02-31 viraria 03/03: só vale se voltar igual.
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : undefined;
}

export function toISODate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// dd/MM/aaaa para exibir no botão.
export function formatBRDate(value: string | null | undefined): string {
  const date = parseISODate(value);
  if (!date) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function parseTime(value: string | null | undefined): { hour: number; minute: number } | undefined {
  const match = value ? TIME.exec(value) : null;
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : undefined;
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Minutos da lista: de `step` em `step`, mais o minuto atual se ele não for múltiplo (não esconde um valor já salvo).
export function minuteOptions(step: number, current?: number): number[] {
  const safeStep = Number.isInteger(step) && step >= 1 && step <= 30 ? step : 5;
  const list: number[] = [];
  for (let m = 0; m < 60; m += safeStep) list.push(m);
  if (current !== undefined && !list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}

// "yyyy-MM-ddTHH:mm" (o que o datetime-local usava) <-> partes.
export function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  const [date = "", time = ""] = (value ?? "").split("T");
  return { date: parseISODate(date) ? date : "", time: parseTime(time.slice(0, 5)) ? time.slice(0, 5) : "" };
}

export function joinDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}

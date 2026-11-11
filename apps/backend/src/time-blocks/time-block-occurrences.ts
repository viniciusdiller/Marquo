import { DateTime } from "luxon";

// Mesmo fuso fixo do resto do agendamento.
const TIMEZONE = "America/Sao_Paulo";
// Teto de dias percorridos por chamada: a agenda e a disponibilidade olham 1 a poucos dias; isto só barra um intervalo absurdo.
const MAX_DAYS_SCANNED = 400;

export interface BlockLike {
  startAt: Date;
  endAt: Date;
  // Ausente (dados antigos, mocks) = bloqueio único.
  recurrence?: "NONE" | "DAILY" | null;
  // @db.Date: o Prisma devolve a data à meia-noite UTC; vale o dia civil dela.
  repeatUntil?: Date | null;
}

export interface Occurrence {
  startAt: Date;
  endAt: Date;
}

export function isDaily(block: BlockLike): boolean {
  return block.recurrence === "DAILY";
}

function untilDay(block: BlockLike): DateTime | null {
  if (!block.repeatUntil) return null;
  const iso = DateTime.fromJSDate(block.repeatUntil, { zone: "utc" }).toISODate();
  return iso ? DateTime.fromISO(iso, { zone: TIMEZONE }).startOf("day") : null;
}

// Ocorrências do bloqueio que tocam [rangeStart, rangeEnd). Bloqueio único devolve ele mesmo (se tocar o intervalo);
// DAILY devolve a janela de hora de cada dia dentro do intervalo, a partir do dia do primeiro bloqueio e até `repeatUntil`.
export function occurrencesInRange(block: BlockLike, rangeStart: Date, rangeEnd: Date): Occurrence[] {
  if (!isDaily(block)) {
    return block.startAt < rangeEnd && block.endAt > rangeStart ? [{ startAt: block.startAt, endAt: block.endAt }] : [];
  }

  const first = DateTime.fromJSDate(block.startAt, { zone: TIMEZONE });
  const last = DateTime.fromJSDate(block.endAt, { zone: TIMEZONE });
  const firstDay = first.startOf("day");
  const until = untilDay(block);

  let day = DateTime.max(firstDay, DateTime.fromJSDate(rangeStart, { zone: TIMEZONE }).startOf("day"));
  const lastDay = DateTime.fromJSDate(rangeEnd, { zone: TIMEZONE }).startOf("day");

  const result: Occurrence[] = [];
  for (let i = 0; i < MAX_DAYS_SCANNED && day <= lastDay && (!until || day <= until); i++, day = day.plus({ days: 1 })) {
    const startAt = day.set({ hour: first.hour, minute: first.minute, second: 0, millisecond: 0 }).toJSDate();
    const endAt = day.set({ hour: last.hour, minute: last.minute, second: 0, millisecond: 0 }).toJSDate();
    if (startAt < rangeEnd && endAt > rangeStart) result.push({ startAt, endAt });
  }
  return result;
}

// Algum bloqueio da lista cobre (qualquer parte de) [start, end)?
export function anyBlockOverlaps(blocks: BlockLike[], start: Date, end: Date): boolean {
  return blocks.some((block) => occurrencesInRange(block, start, end).length > 0);
}

// Bloqueios diários já iniciados e ainda não encerrados no intervalo (corte fino por dia/hora em occurrencesInRange).
export function dailyBlocksWhere(rangeStart: Date, rangeEnd: Date) {
  const rangeStartDay = DateTime.fromJSDate(rangeStart, { zone: TIMEZONE }).toISODate()!;
  return {
    recurrence: "DAILY" as const,
    startAt: { lt: rangeEnd },
    OR: [{ repeatUntil: null }, { repeatUntil: { gte: new Date(`${rangeStartDay}T00:00:00.000Z`) } }],
  };
}

// Filtro de banco com os bloqueios que PODEM tocar [rangeStart, rangeEnd): únicos que se sobrepõem + diários elegíveis.
export function blocksTouchingWhere(rangeStart: Date, rangeEnd: Date) {
  return {
    OR: [
      { recurrence: "NONE" as const, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      dailyBlocksWhere(rangeStart, rangeEnd),
    ],
  };
}

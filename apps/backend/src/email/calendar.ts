// Convite de calendário do agendamento: link do Google Calendar (botão no e-mail) e arquivo .ics (Apple, Outlook e
// qualquer outro app). Tudo é derivado do atendimento já gravado, nunca do request.

export interface CalendarEvent {
  // Estável entre remarcações: o mesmo UID + SEQUENCE maior faz o app ATUALIZAR o evento em vez de duplicar.
  uid: string;
  sequence: number;
  title: string;
  description: string;
  location?: string;
  startAt: Date;
  endAt: Date;
}

// 20260310T173000Z (UTC, sem separadores): o formato que o Google e o iCalendar esperam.
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// RFC 5545 §3.3.11: barra, ponto e vírgula, vírgula e quebra de linha precisam de escape em campos de texto.
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 §3.1: linhas com no máximo 75 OCTETOS; a continuação começa com um espaço. Quebra em pontos de
// código (nunca no meio de um caractere acentuado).
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    // A linha de continuação já gasta 1 octeto com o espaço inicial.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marquo//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(event.startAt)}`,
    `DTEND:${toIcsUtc(event.endAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toIcsUtc(event.startAt)}/${toIcsUtc(event.endAt)}`,
    details: event.description,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

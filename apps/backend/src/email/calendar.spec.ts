import { buildGoogleCalendarUrl, buildIcs, CalendarEvent } from "./calendar";

const event: CalendarEvent = {
  uid: "appt-1@marquo.com.br",
  sequence: 0,
  title: "Corte - Salão, Centro",
  description: "Serviço: Corte\nProfissional: Alex",
  location: "Salão; Rua A, 1",
  startAt: new Date("2026-03-10T17:30:00.000Z"),
  endAt: new Date("2026-03-10T18:30:00.000Z"),
};

describe("buildIcs", () => {
  const ics = buildIcs(event, new Date("2026-03-01T12:00:00.000Z"));

  it("gera um VCALENDAR/VEVENT válido com datas em UTC e CRLF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:appt-1@marquo.com.br");
    expect(ics).toContain("DTSTAMP:20260301T120000Z");
    expect(ics).toContain("DTSTART:20260310T173000Z");
    expect(ics).toContain("DTEND:20260310T183000Z");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("escapa vírgula, ponto e vírgula e quebra de linha (RFC 5545)", () => {
    expect(ics).toContain("SUMMARY:Corte - Salão\\, Centro");
    expect(ics).toContain("DESCRIPTION:Serviço: Corte\\nProfissional: Alex");
    expect(ics).toContain("LOCATION:Salão\\; Rua A\\, 1");
  });

  it("texto digitado por usuário não consegue injetar propriedades novas no arquivo", () => {
    const evil = buildIcs({ ...event, title: "x\r\nATTENDEE:mailto:atacante@x.com" });
    expect(evil).not.toMatch(/^ATTENDEE:/m);
  });

  it("dobra linhas longas em 75 octetos sem quebrar caracteres acentuados", () => {
    const long = buildIcs({ ...event, description: "ã".repeat(200) });
    for (const line of long.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(long.replace(/\r\n /g, "")).toContain("ã".repeat(200));
  });

  it("sem local, não escreve a propriedade LOCATION", () => {
    expect(buildIcs({ ...event, location: undefined })).not.toContain("LOCATION");
  });

  it("repete o UID e usa o SEQUENCE informado (remarcação atualiza o mesmo evento)", () => {
    const rescheduled = buildIcs({ ...event, sequence: 3 });
    expect(rescheduled).toContain("UID:appt-1@marquo.com.br");
    expect(rescheduled).toContain("SEQUENCE:3");
  });
});

describe("buildGoogleCalendarUrl", () => {
  const url = new URL(buildGoogleCalendarUrl(event));

  it("aponta para o Google Calendar com título, datas, detalhes e local", () => {
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Corte - Salão, Centro");
    expect(url.searchParams.get("dates")).toBe("20260310T173000Z/20260310T183000Z");
    expect(url.searchParams.get("details")).toContain("Profissional: Alex");
    expect(url.searchParams.get("location")).toBe("Salão; Rua A, 1");
  });

  it("sem local, omite o parâmetro", () => {
    expect(new URL(buildGoogleCalendarUrl({ ...event, location: undefined })).searchParams.has("location")).toBe(false);
  });
});

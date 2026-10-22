import { DateTime } from "luxon";
import type { EmailAttachment, EmailMessage } from "./email.service";
import { buildGoogleCalendarUrl, buildIcs, CalendarEvent } from "./calendar";

// Mesmo fuso fixo do resto do backend (ver AppointmentsService).
const TENANT_TIMEZONE = "America/Sao_Paulo";

// Paleta da identidade visual do Marquo.
const COLOR = {
  primary: "#6C3BF4",
  primaryDark: "#5C2CE0",
  lilacBg: "#F1ECFF",
  lilac: "#E3D9FF",
  coral: "#FF6B5A",
  graphite: "#17161A",
  muted: "#6B6676",
};

export type AppointmentEmailEvent = "CREATED" | "CANCELED" | "RESCHEDULED" | "REMINDER";
export type AppointmentEmailAudience = "STAFF" | "CLIENT";

export interface AppointmentEmailData {
  event: AppointmentEmailEvent;
  audience: AppointmentEmailAudience;
  // Identifica o atendimento no convite de calendário (mesmo UID em toda remarcação).
  appointmentId: string;
  rescheduledCount: number;
  tenantName: string;
  clientName: string;
  // Telefone do cliente (só dígitos, sem DDI): aparece para a EQUIPE, que precisa falar com ele.
  clientPhone?: string;
  professionalName: string;
  serviceNames: string[];
  startAt: Date;
  endAt: Date;
  // Contato do estabelecimento (aparece para o CLIENTE): endereço montado e WhatsApp (só dígitos, com DDI 55).
  tenantAddress?: string;
  tenantPhone?: string;
  // Links absolutos (a imagem precisa de URL pública: e-mail não carrega arquivo local).
  dashboardUrl?: string;
  publicUrl?: string;
  logoUrl?: string;
  siteUrl?: string;
}

export interface AppointmentEmail extends Pick<EmailMessage, "subject" | "html" | "text"> {
  attachments: EmailAttachment[];
}

// Todo texto vindo de usuário (nome do salão, do cliente, do profissional, do serviço, endereço) passa por aqui
// antes de entrar no HTML: um nome como `<img src=x onerror=...>` não pode virar marcação no e-mail de outra pessoa.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatWhen(date: Date): string {
  const dt = DateTime.fromJSDate(date).setZone(TENANT_TIMEZONE).setLocale("pt-BR");
  return `${dt.toFormat("cccc, dd/LL/yyyy")} às ${dt.toFormat("HH:mm")}`;
}

// "5511912345678" ou "11912345678" -> "(11) 91234-5678". Número fora do padrão volta como veio (nunca quebra o e-mail).
export function formatPhone(digits: string): string {
  const national = /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
  const match = /^(\d{2})(\d{4,5})(\d{4})$/.exec(national);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : digits;
}

function whatsappUrl(digits: string): string {
  return `https://wa.me/${/^55\d{10,11}$/.test(digits) ? digits : `55${digits}`}`;
}

const TITLE: Record<AppointmentEmailEvent, { staff: string; client: string }> = {
  CREATED: { staff: "Novo agendamento", client: "Agendamento confirmado" },
  CANCELED: { staff: "Agendamento cancelado", client: "Agendamento cancelado" },
  RESCHEDULED: { staff: "Agendamento remarcado", client: "Agendamento remarcado" },
  REMINDER: { staff: "Lembrete de agendamento", client: "Lembrete do seu agendamento" },
};

const BADGE_COLOR: Record<AppointmentEmailEvent, string> = {
  CREATED: COLOR.primary,
  CANCELED: COLOR.coral,
  RESCHEDULED: COLOR.primaryDark,
  REMINDER: COLOR.primary,
};

export function buildAppointmentEmail(data: AppointmentEmailData): AppointmentEmail {
  const staff = data.audience === "STAFF";
  const title = TITLE[data.event][staff ? "staff" : "client"];
  const when = formatWhen(data.startAt);
  const services = data.serviceNames.length > 0 ? data.serviceNames.join(", ") : "Serviço";

  // Convite de calendário só faz sentido para um horário que ainda vale (não no cancelamento).
  const wantsCalendar = data.event !== "CANCELED";
  const calendarEvent: CalendarEvent = {
    uid: `${data.appointmentId}@marquo.com.br`,
    sequence: data.rescheduledCount,
    title: staff ? `${data.clientName} - ${services}` : `${services} - ${data.tenantName}`,
    description: staff
      ? `Cliente: ${data.clientName}\nServiço: ${services}\nProfissional: ${data.professionalName}`
      : `Serviço: ${services}\nProfissional: ${data.professionalName}\nAgendado pelo Marquo.`,
    location: !staff && data.tenantAddress ? `${data.tenantName}, ${data.tenantAddress}` : undefined,
    startAt: data.startAt,
    endAt: data.endAt,
  };
  const googleUrl = wantsCalendar ? buildGoogleCalendarUrl(calendarEvent) : undefined;
  const attachments: EmailAttachment[] = wantsCalendar
    ? [
        {
          filename: "agendamento.ics",
          content: Buffer.from(buildIcs(calendarEvent), "utf8").toString("base64"),
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        },
      ]
    : [];

  // Linhas (rótulo, valor, link opcional): o mesmo conteúdo alimenta a versão em texto e a em HTML.
  const rows: [string, string, string?][] = staff
    ? [
        ["Cliente", data.clientName],
        ...(data.clientPhone
          ? [["Telefone", formatPhone(data.clientPhone), whatsappUrl(data.clientPhone)] as [string, string, string]]
          : []),
        ["Serviço", services],
        ["Profissional", data.professionalName],
        ["Quando", when],
      ]
    : [
        ["Local", data.tenantName],
        ...(data.tenantAddress ? [["Endereço", data.tenantAddress] as [string, string]] : []),
        ...(data.tenantPhone
          ? [["Telefone", formatPhone(data.tenantPhone), whatsappUrl(data.tenantPhone)] as [string, string, string]]
          : []),
        ["Serviço", services],
        ["Profissional", data.professionalName],
        ["Quando", when],
      ];

  const link = staff ? data.dashboardUrl : data.publicUrl;
  const linkLabel = staff ? "Abrir a agenda" : "Ver o estabelecimento";
  const subject = `${title}: ${staff ? data.clientName : data.tenantName}, ${when}`;

  // ───────── Texto puro ─────────
  const text = [
    title,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(googleUrl ? ["", `Adicionar ao Google Agenda: ${googleUrl}`, "(O arquivo agendamento.ics em anexo funciona no Apple Calendar e no Outlook.)"] : []),
    ...(link ? ["", `${linkLabel}: ${link}`] : []),
    "",
    `Enviado pelo Marquo em nome de ${data.tenantName}.`,
  ].join("\n");

  // ───────── HTML (CSS inline e tabelas: é o que Gmail e Outlook respeitam) ─────────
  const font = "font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif";
  const logo = (width: number) =>
    data.logoUrl
      ? `<img src="${escapeHtml(data.logoUrl)}" alt="Marquo" width="${width}" style="display:block;border:0;outline:none;height:auto;width:${width}px" />`
      : `<span style="${font};font-size:${width > 120 ? 22 : 16}px;font-weight:800;color:${COLOR.primary}">Marquo</span>`;

  const htmlRows = rows
    .map(([label, value, href]) => {
      const content = href
        ? `<a href="${escapeHtml(href)}" style="color:${COLOR.primary};text-decoration:none">${escapeHtml(value)}</a>`
        : escapeHtml(value);
      return `<tr><td style="padding:7px 16px 7px 0;color:${COLOR.muted};font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:7px 0;font-size:15px;font-weight:600;color:${COLOR.graphite}">${content}</td></tr>`;
    })
    .join("");

  const button = (href: string, label: string, filled: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;${font};font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 20px;margin:0 8px 8px 0;${
      filled
        ? `background:${COLOR.primary};color:#ffffff;border:2px solid ${COLOR.primary}`
        : `background:#ffffff;color:${COLOR.primary};border:2px solid ${COLOR.primary}`
    }">${escapeHtml(label)}</a>`;

  const buttons = [
    ...(googleUrl ? [button(googleUrl, "Adicionar ao Google Agenda", true)] : []),
    ...(link ? [button(link, linkLabel, !googleUrl)] : []),
  ].join("");
  const calendarNote = googleUrl
    ? `<p style="margin:4px 0 0;font-size:12px;color:${COLOR.muted}">Usa Apple Calendar ou Outlook? Abra o arquivo <strong>agendamento.ics</strong> em anexo.</p>`
    : "";

  const siteLink = data.siteUrl
    ? `<a href="${escapeHtml(data.siteUrl)}" style="color:${COLOR.primary};text-decoration:none">${escapeHtml(data.siteUrl.replace(/^https?:\/\//, ""))}</a>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.lilacBg};${font};color:${COLOR.graphite}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.lilacBg}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px">${logo(150)}</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:28px">
<span style="display:inline-block;background:${BADGE_COLOR[data.event]};color:#ffffff;${font};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:4px 12px">${escapeHtml(data.event === "CREATED" ? (staff ? "Novo" : "Confirmado") : data.event === "CANCELED" ? "Cancelado" : data.event === "REMINDER" ? "Lembrete" : "Remarcado")}</span>
<h1 style="margin:14px 0 18px;font-size:22px;line-height:1.3;color:${COLOR.graphite}">${escapeHtml(title)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${COLOR.lilacBg};border-radius:12px"><tr><td style="padding:12px 18px"><table role="presentation" cellpadding="0" cellspacing="0">${htmlRows}</table></td></tr></table>
${buttons ? `<div style="margin-top:22px">${buttons}</div>` : ""}${calendarNote}
</td></tr>
<tr><td style="padding:22px 4px 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">${logo(96)}</td><td style="vertical-align:middle;${font};font-size:12px;line-height:1.5;color:${COLOR.muted}">Enviado pelo Marquo em nome de ${escapeHtml(data.tenantName)}.${siteLink ? `<br>${siteLink}` : ""}</td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text, attachments };
}

import { DateTime } from "luxon";
import type { EmailMessage } from "./email.service";

// Mesmo fuso fixo do resto do backend (ver AppointmentsService).
const TENANT_TIMEZONE = "America/Sao_Paulo";

export type AppointmentEmailEvent = "CREATED" | "CANCELED" | "RESCHEDULED";
export type AppointmentEmailAudience = "STAFF" | "CLIENT";

export interface AppointmentEmailData {
  event: AppointmentEmailEvent;
  audience: AppointmentEmailAudience;
  tenantName: string;
  clientName: string;
  professionalName: string;
  serviceNames: string[];
  startAt: Date;
  // Link do painel (só para a equipe) e da página pública do salão (só para o cliente).
  dashboardUrl?: string;
  publicUrl?: string;
}

// Todo texto vindo de usuário (nome do salão, do cliente, do profissional, do serviço) passa por aqui antes de
// entrar no HTML: um nome como `<img src=x onerror=...>` não pode virar marcação no e-mail de outra pessoa.
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

const VERB: Record<AppointmentEmailEvent, { staff: string; client: string }> = {
  CREATED: { staff: "Novo agendamento", client: "Agendamento confirmado" },
  CANCELED: { staff: "Agendamento cancelado", client: "Agendamento cancelado" },
  RESCHEDULED: { staff: "Agendamento remarcado", client: "Agendamento remarcado" },
};

export function buildAppointmentEmail(data: AppointmentEmailData): Pick<EmailMessage, "subject" | "html" | "text"> {
  const title = VERB[data.event][data.audience === "STAFF" ? "staff" : "client"];
  const when = formatWhen(data.startAt);
  const services = data.serviceNames.length > 0 ? data.serviceNames.join(", ") : "Serviço";

  // Linhas (rótulo, valor) — o mesmo conteúdo alimenta a versão em texto e em HTML.
  const rows: [string, string][] =
    data.audience === "STAFF"
      ? [
          ["Cliente", data.clientName],
          ["Serviço", services],
          ["Profissional", data.professionalName],
          ["Quando", when],
        ]
      : [
          ["Local", data.tenantName],
          ["Serviço", services],
          ["Profissional", data.professionalName],
          ["Quando", when],
        ];

  const link = data.audience === "STAFF" ? data.dashboardUrl : data.publicUrl;
  const linkLabel = data.audience === "STAFF" ? "Abrir a agenda" : "Ver o estabelecimento";

  const subject = `${title}: ${data.audience === "STAFF" ? data.clientName : data.tenantName}, ${when}`;

  const text = [
    title,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(link ? ["", `${linkLabel}: ${link}`] : []),
    "",
    `Enviado pelo Marquo em nome de ${data.tenantName}.`,
  ].join("\n");

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b7280">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const htmlLink = link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(linkLabel)}</a></p>`
    : "";

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827"><div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:12px;padding:24px"><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1><table style="border-collapse:collapse;font-size:15px">${htmlRows}</table>${htmlLink}</div><p style="color:#9ca3af;font-size:12px;margin:16px 0 0">Enviado pelo Marquo em nome de ${escapeHtml(data.tenantName)}.</p></div></body></html>`;

  return { subject, html, text };
}

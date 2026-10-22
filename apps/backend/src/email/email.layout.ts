import { escapeHtml } from "./email.templates";

// Casca visual comum dos e-mails do Marquo (logo no topo e no rodapé, cartão branco, paleta da marca). CSS inline e
// tabelas: é o que Gmail e Outlook respeitam. O CONTEÚDO de cada e-mail entra pronto (já escapado) em `innerHtml`.

export const EMAIL_COLOR = {
  primary: "#6C3BF4",
  primaryDark: "#5C2CE0",
  lilacBg: "#F1ECFF",
  lilac: "#E3D9FF",
  coral: "#FF6B5A",
  graphite: "#17161A",
  muted: "#6B6676",
};

export const EMAIL_FONT = "font-family:Manrope,'Segoe UI',Arial,Helvetica,sans-serif";

export function emailLogo(logoUrl: string | undefined, width: number): string {
  return logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Marquo" width="${width}" style="display:block;border:0;outline:none;height:auto;width:${width}px" />`
    : `<span style="${EMAIL_FONT};font-size:${width > 120 ? 22 : 16}px;font-weight:800;color:${EMAIL_COLOR.primary}">Marquo</span>`;
}

export function emailButton(href: string, label: string, filled = true): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;${EMAIL_FONT};font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 20px;margin:0 8px 8px 0;${
    filled
      ? `background:${EMAIL_COLOR.primary};color:#ffffff;border:2px solid ${EMAIL_COLOR.primary}`
      : `background:#ffffff;color:${EMAIL_COLOR.primary};border:2px solid ${EMAIL_COLOR.primary}`
  }">${escapeHtml(label)}</a>`;
}

export interface EmailShellOptions {
  title: string;
  // Etiqueta colorida acima do título (ex.: "Segurança").
  badge?: { text: string; color: string };
  // HTML do miolo, JÁ escapado por quem chama.
  innerHtml: string;
  // Texto do rodapé, em texto puro (é escapado aqui).
  footerText: string;
  logoUrl?: string;
  siteUrl?: string;
}

export function renderEmailShell(options: EmailShellOptions): string {
  const siteLink = options.siteUrl
    ? `<br><a href="${escapeHtml(options.siteUrl)}" style="color:${EMAIL_COLOR.primary};text-decoration:none">${escapeHtml(options.siteUrl.replace(/^https?:\/\//, ""))}</a>`
    : "";
  const badge = options.badge
    ? `<span style="display:inline-block;background:${options.badge.color};color:#ffffff;${EMAIL_FONT};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:4px 12px">${escapeHtml(options.badge.text)}</span>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.title)}</title></head>
<body style="margin:0;padding:0;background:${EMAIL_COLOR.lilacBg};${EMAIL_FONT};color:${EMAIL_COLOR.graphite}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLOR.lilacBg}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px">${emailLogo(options.logoUrl, 150)}</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:28px">
${badge}
<h1 style="margin:14px 0 18px;font-size:22px;line-height:1.3;color:${EMAIL_COLOR.graphite}">${escapeHtml(options.title)}</h1>
${options.innerHtml}
</td></tr>
<tr><td style="padding:22px 4px 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">${emailLogo(options.logoUrl, 96)}</td><td style="vertical-align:middle;${EMAIL_FONT};font-size:12px;line-height:1.5;color:${EMAIL_COLOR.muted}">${escapeHtml(options.footerText)}${siteLink}</td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`;
}

// Parágrafo de texto no miolo (o conteúdo é escapado aqui).
export function emailParagraph(text: string, muted = false): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${muted ? EMAIL_COLOR.muted : EMAIL_COLOR.graphite}">${escapeHtml(text)}</p>`;
}

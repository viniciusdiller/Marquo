import { EMAIL_COLOR, emailButton, emailParagraph, renderEmailShell } from "./email.layout";

export interface EmailVerificationEmailData {
  name: string;
  link: string;
  expiresInHours: number;
  logoUrl?: string;
  siteUrl?: string;
}

// Confirmação do e-mail de quem criou uma conta de negócio. O link leva o token em claro: este e-mail é a ÚNICA vez em
// que ele sai do servidor (no banco fica só o hash).
export function buildEmailVerificationEmail(data: EmailVerificationEmailData) {
  const title = "Confirme seu e-mail";
  const intro = `Olá, ${data.name}. Falta só um passo para entrar no Marquo: confirme que este e-mail é seu.`;
  const validity = `O link vale por ${data.expiresInHours} horas e só pode ser usado uma vez.`;
  const ignore = "Se você não criou uma conta no Marquo, ignore este e-mail.";

  const text = [title, "", intro, "", `Confirmar e-mail: ${data.link}`, "", validity, ignore, "", "Enviado pelo Marquo."].join("\n");

  const html = renderEmailShell({
    title,
    badge: { text: "Confirmação", color: EMAIL_COLOR.primary },
    innerHtml: `${emailParagraph(intro)}<div style="margin:6px 0 16px">${emailButton(data.link, "Confirmar meu e-mail")}</div>${emailParagraph(validity, true)}${emailParagraph(ignore, true)}`,
    footerText: "Enviado pelo Marquo.",
    logoUrl: data.logoUrl,
    siteUrl: data.siteUrl,
  });

  return { subject: "Confirme seu e-mail no Marquo", html, text };
}

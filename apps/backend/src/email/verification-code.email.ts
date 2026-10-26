import { EMAIL_COLOR, emailParagraph, renderEmailShell } from "./email.layout";
import { escapeHtml } from "./email.templates";

export interface VerificationCodeEmailData {
  title: string;
  intro: string;
  code: string;
  expiresInMinutes: number;
  logoUrl?: string;
  siteUrl?: string;
}

// E-mail com um código numérico de uso único (confirmação de e-mail no cadastro do cliente e 2FA da plataforma).
// O código só aparece aqui, uma vez: no servidor fica apenas o HMAC.
export function buildVerificationCodeEmail(data: VerificationCodeEmailData) {
  const validity = `O código vale por ${data.expiresInMinutes} minutos e só pode ser usado uma vez.`;
  const ignore = "Se não foi você, ignore este e-mail e não compartilhe o código com ninguém.";

  const text = [data.title, "", data.intro, "", `Seu código: ${data.code}`, "", validity, ignore, "", "Enviado pelo Marquo."].join("\n");

  const codeBox = `<div style="margin:6px 0 18px;padding:16px;background:${EMAIL_COLOR.lilacBg};border-radius:12px;text-align:center"><span style="font-size:32px;font-weight:800;letter-spacing:8px;color:${EMAIL_COLOR.primary}">${escapeHtml(data.code)}</span></div>`;

  const html = renderEmailShell({
    title: data.title,
    badge: { text: "Segurança", color: EMAIL_COLOR.primaryDark },
    innerHtml: `${emailParagraph(data.intro)}${codeBox}${emailParagraph(validity, true)}${emailParagraph(ignore, true)}`,
    footerText: "Enviado pelo Marquo.",
    logoUrl: data.logoUrl,
    siteUrl: data.siteUrl,
  });

  return { subject: `${data.code} é o seu código do Marquo`, html, text };
}

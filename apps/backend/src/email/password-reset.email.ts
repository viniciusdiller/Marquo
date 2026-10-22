import {
  EMAIL_COLOR,
  emailButton,
  emailParagraph,
  renderEmailShell,
} from "./email.layout";

export interface PasswordResetEmailData {
  name: string;
  link: string;
  expiresInMinutes: number;
  logoUrl?: string;
  siteUrl?: string;
}

// O link leva o token em claro: este e-mail é a ÚNICA vez em que ele sai do servidor (no banco fica só o hash).
export function buildPasswordResetEmail(data: PasswordResetEmailData) {
  const title = "Redefinir sua senha";
  const intro = `Olá, ${data.name}. Recebemos um pedido para redefinir a senha da sua conta no Marquo.`;
  const validity = `O link vale por ${data.expiresInMinutes} minutos e só pode ser usado uma vez.`;
  const ignore = "Se não foi você, ignore este e-mail: sua senha continua a mesma.";

  const text = [title, "", intro, "", `Escolha uma nova senha: ${data.link}`, "", validity, ignore, "", "Enviado pelo Marquo."].join("\n");

  const html = renderEmailShell({
    title,
    badge: { text: "Segurança", color: EMAIL_COLOR.primaryDark },
    innerHtml: `${emailParagraph(intro)}<div style="margin:6px 0 16px">${emailButton(data.link, "Escolher nova senha")}</div>${emailParagraph(validity, true)}${emailParagraph(ignore, true)}`,
    footerText: "Enviado pelo Marquo.",
    logoUrl: data.logoUrl,
    siteUrl: data.siteUrl,
  });

  return { subject: "Redefinir sua senha no Marquo", html, text };
}

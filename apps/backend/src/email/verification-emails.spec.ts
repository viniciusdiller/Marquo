import { buildEmailVerificationEmail } from "./email-verification.email";
import { buildVerificationCodeEmail } from "./verification-code.email";

describe("buildEmailVerificationEmail", () => {
  const data = { name: "Ana", link: "https://marquo.com.br/verificar-email?token=abc", expiresInHours: 24, logoUrl: "https://marquo.com.br/brand/email/marquo-logo.png", siteUrl: "https://marquo.com.br" };

  it("traz o link, a validade e o aviso de ignorar", () => {
    const { subject, html, text } = buildEmailVerificationEmail(data);
    expect(subject).toContain("Confirme");
    expect(text).toContain(data.link);
    expect(text).toContain("24 horas");
    expect(text).toContain("ignore este e-mail");
    expect(html).toContain(`href="${data.link}"`);
  });

  it("escapa HTML no nome e no link", () => {
    const { html } = buildEmailVerificationEmail({ ...data, name: "<script>x</script>", link: `https://x.com/"><script>` });
    expect(html).not.toContain("<script>");
  });
});

describe("buildVerificationCodeEmail", () => {
  const data = { title: "Confirme seu e-mail", intro: "Use o código abaixo.", code: "042913", expiresInMinutes: 10 };

  it("mostra o código no assunto, no texto e em destaque no HTML", () => {
    const { subject, html, text } = buildVerificationCodeEmail(data);
    expect(subject).toContain("042913");
    expect(text).toContain("Seu código: 042913");
    expect(text).toContain("10 minutos");
    expect(html).toContain("042913");
  });

  it("avisa para não compartilhar o código", () => {
    expect(buildVerificationCodeEmail(data).text).toContain("não compartilhe");
  });

  it("escapa HTML no título e na introdução", () => {
    const { html } = buildVerificationCodeEmail({ ...data, title: "<img src=x onerror=1>", intro: "<script>x</script>" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
  });
});

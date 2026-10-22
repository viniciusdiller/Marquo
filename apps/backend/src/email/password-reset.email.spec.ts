import { buildPasswordResetEmail } from "./password-reset.email";

const base = {
  name: "Ana",
  link: "https://marquo.com.br/definir-senha?token=abc123",
  expiresInMinutes: 60,
  logoUrl: "https://marquo.com.br/brand/email/marquo-logo.png",
  siteUrl: "https://marquo.com.br",
};

describe("buildPasswordResetEmail", () => {
  it("traz o link, a validade e o aviso de ignorar, em texto e em HTML", () => {
    const { subject, html, text } = buildPasswordResetEmail(base);
    expect(subject).toContain("Redefinir");
    expect(text).toContain(base.link);
    expect(text).toContain("60 minutos");
    expect(text).toContain("ignore este e-mail");
    expect(html).toContain(`href="${base.link}"`);
    expect(html.match(/marquo-logo\.png/g)).toHaveLength(2);
  });

  it("escapa HTML no nome e no link", () => {
    const { html } = buildPasswordResetEmail({ ...base, name: "<script>x</script>", link: `https://x.com/"><script>` });
    expect(html).not.toContain("<script>");
  });
});

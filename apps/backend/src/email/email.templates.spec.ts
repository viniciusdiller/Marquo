import { buildAppointmentEmail, escapeHtml, formatWhen, AppointmentEmailData } from "./email.templates";

// 2026-03-10 17:30 UTC = 14:30 em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
const START = new Date("2026-03-10T17:30:00.000Z");

const base: AppointmentEmailData = {
  event: "CREATED",
  audience: "STAFF",
  tenantName: "Barbearia Del Bianco",
  clientName: "João Silva",
  professionalName: "Alex",
  serviceNames: ["Corte", "Barba"],
  startAt: START,
  dashboardUrl: "https://marquo.com.br/dashboard/agenda",
  publicUrl: "https://marquo.com.br/del-bianco",
};

describe("escapeHtml", () => {
  it("escapa os caracteres que abrem marcação ou atributo", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;",
    );
  });
});

describe("formatWhen", () => {
  it("formata no fuso de São Paulo, não no do processo", () => {
    expect(formatWhen(START)).toContain("10/03/2026 às 14:30");
  });
});

describe("buildAppointmentEmail", () => {
  it("equipe: novo agendamento traz cliente, serviços, profissional, horário e o link do painel", () => {
    const { subject, html, text } = buildAppointmentEmail(base);

    expect(subject).toContain("Novo agendamento");
    expect(subject).toContain("João Silva");
    expect(text).toContain("Cliente: João Silva");
    expect(text).toContain("Serviço: Corte, Barba");
    expect(text).toContain("Profissional: Alex");
    expect(text).toContain("14:30");
    expect(text).toContain("https://marquo.com.br/dashboard/agenda");
    expect(html).toContain("Abrir a agenda");
  });

  it("cliente: confirmação mostra o local e o link da página pública, sem link do painel", () => {
    const { subject, text, html } = buildAppointmentEmail({ ...base, audience: "CLIENT" });

    expect(subject).toContain("Agendamento confirmado");
    expect(text).toContain("Local: Barbearia Del Bianco");
    expect(text).toContain("https://marquo.com.br/del-bianco");
    expect(text).not.toContain("/dashboard");
    expect(html).not.toContain("/dashboard");
  });

  it("usa o título certo para cancelamento e remarcação", () => {
    expect(buildAppointmentEmail({ ...base, event: "CANCELED" }).subject).toContain("Agendamento cancelado");
    expect(buildAppointmentEmail({ ...base, event: "RESCHEDULED" }).subject).toContain("Agendamento remarcado");
  });

  // Segurança: nomes são digitados por usuários e o e-mail é lido por OUTRA pessoa.
  it("escapa HTML em nome de cliente, salão, profissional e serviço", () => {
    const evil = `<script>alert(1)</script>`;
    const { html } = buildAppointmentEmail({
      ...base,
      clientName: evil,
      tenantName: evil,
      professionalName: evil,
      serviceNames: [evil],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapa aspas no link para não escapar do atributo href", () => {
    const { html } = buildAppointmentEmail({ ...base, dashboardUrl: `https://x.com/"><script>` });
    expect(html).not.toContain(`"><script>`);
  });

  it("sem link configurado, o e-mail sai sem o botão", () => {
    const { html, text } = buildAppointmentEmail({ ...base, dashboardUrl: undefined });
    expect(html).not.toContain("Abrir a agenda");
    expect(text).not.toContain("Abrir a agenda");
  });
});

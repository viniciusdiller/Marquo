import {
  AppointmentEmailData,
  buildAppointmentEmail,
  escapeHtml,
  formatPhone,
  formatWhen,
} from "./email.templates";

// 2026-03-10 17:30 UTC = 14:30 em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
const START = new Date("2026-03-10T17:30:00.000Z");
const END = new Date("2026-03-10T18:30:00.000Z");

const base: AppointmentEmailData = {
  event: "CREATED",
  audience: "STAFF",
  appointmentId: "appt-1",
  rescheduledCount: 0,
  tenantName: "Barbearia Del Bianco",
  clientName: "João Silva",
  clientPhone: "11999998888",
  professionalName: "Alex",
  serviceNames: ["Corte", "Barba"],
  startAt: START,
  endAt: END,
  tenantAddress: "Rua Julia Kubitschek, 16, Centro, Cabo Frio",
  tenantPhone: "5522999887766",
  dashboardUrl: "https://marquo.com.br/dashboard/agenda",
  publicUrl: "https://marquo.com.br/del-bianco",
  logoUrl: "https://marquo.com.br/brand/email/marquo-logo.png",
  siteUrl: "https://marquo.com.br",
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

describe("formatPhone", () => {
  it("formata celular e fixo, com ou sem DDI 55", () => {
    expect(formatPhone("5522999887766")).toBe("(22) 99988-7766");
    expect(formatPhone("22999887766")).toBe("(22) 99988-7766");
    expect(formatPhone("2226431234")).toBe("(22) 2643-1234");
  });

  it("número fora do padrão volta como veio (não quebra o e-mail)", () => {
    expect(formatPhone("123")).toBe("123");
  });
});

describe("buildAppointmentEmail", () => {
  it("equipe: novo agendamento traz cliente, telefone, serviços, profissional, horário e o link do painel", () => {
    const { subject, html, text } = buildAppointmentEmail(base);

    expect(subject).toContain("Novo agendamento");
    expect(subject).toContain("João Silva");
    expect(text).toContain("Cliente: João Silva");
    expect(text).toContain("Telefone: (11) 99999-8888");
    expect(text).toContain("Serviço: Corte, Barba");
    expect(text).toContain("Profissional: Alex");
    expect(text).toContain("14:30");
    expect(text).toContain("https://marquo.com.br/dashboard/agenda");
    expect(html).toContain("Abrir a agenda");
    // O telefone do cliente vira link de WhatsApp para a equipe responder rápido.
    expect(html).toContain("https://wa.me/5511999998888");
  });

  it("cliente: confirmação traz local, endereço e telefone do estabelecimento, sem link do painel", () => {
    const { subject, text, html } = buildAppointmentEmail({ ...base, audience: "CLIENT" });

    expect(subject).toContain("Agendamento confirmado");
    expect(text).toContain("Local: Barbearia Del Bianco");
    expect(text).toContain("Endereço: Rua Julia Kubitschek, 16, Centro, Cabo Frio");
    expect(text).toContain("Telefone: (22) 99988-7766");
    expect(text).toContain("https://marquo.com.br/del-bianco");
    expect(text).not.toContain("/dashboard");
    expect(html).not.toContain("/dashboard");
    // Telefone do CLIENTE nunca aparece para o próprio cliente nem vaza para o texto dele.
    expect(text).not.toContain("99999-8888");
  });

  it("cliente: sem endereço ou telefone cadastrados, essas linhas simplesmente não aparecem", () => {
    const { text } = buildAppointmentEmail({
      ...base,
      audience: "CLIENT",
      tenantAddress: undefined,
      tenantPhone: undefined,
    });
    expect(text).not.toContain("Endereço:");
    expect(text).not.toContain("Telefone:");
  });

  it("usa o título certo para cancelamento e remarcação", () => {
    expect(buildAppointmentEmail({ ...base, event: "CANCELED" }).subject).toContain("Agendamento cancelado");
    expect(buildAppointmentEmail({ ...base, event: "RESCHEDULED" }).subject).toContain("Agendamento remarcado");
  });

  describe("lembrete", () => {
    it("lembrete ao cliente: título, etiqueta, horário e convite de calendário", () => {
      const { subject, html, text, attachments } = buildAppointmentEmail({ ...base, audience: "CLIENT", event: "REMINDER" });
      expect(subject).toContain("Lembrete do seu agendamento");
      expect(html).toContain("Lembrete");
      expect(text).toContain("Quando:");
      expect(text).toContain("14:30");
      expect(text).toContain("Adicionar ao Google Agenda");
      expect(attachments).toHaveLength(1);
    });
  });

  describe("calendário", () => {
    it("novo agendamento: botão do Google Agenda + .ics em anexo", () => {
      const { html, text, attachments } = buildAppointmentEmail({ ...base, audience: "CLIENT" });

      expect(html).toContain("Adicionar ao Google Agenda");
      expect(html).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
      expect(text).toContain("Adicionar ao Google Agenda:");
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe("agendamento.ics");
      expect(attachments[0].contentType).toContain("text/calendar");
      const ics = Buffer.from(attachments[0].content, "base64").toString("utf8");
      expect(ics).toContain("UID:appt-1@marquo.com.br");
      expect(ics).toContain("DTSTART:20260310T173000Z");
    });

    it("o local do convite do cliente é o endereço do salão", () => {
      const { attachments } = buildAppointmentEmail({ ...base, audience: "CLIENT" });
      const ics = Buffer.from(attachments[0].content, "base64").toString("utf8").replace(/\r\n /g, "");
      expect(ics).toContain("LOCATION:Barbearia Del Bianco\\, Rua Julia Kubitschek\\, 16\\, Centro\\, Cabo Frio");
    });

    it("remarcação mantém o UID e sobe o SEQUENCE (o app ATUALIZA o evento em vez de duplicar)", () => {
      const { attachments } = buildAppointmentEmail({ ...base, event: "RESCHEDULED", rescheduledCount: 2 });
      const ics = Buffer.from(attachments[0].content, "base64").toString("utf8");
      expect(ics).toContain("UID:appt-1@marquo.com.br");
      expect(ics).toContain("SEQUENCE:2");
    });

    it("cancelamento não oferece convite de calendário", () => {
      const { html, text, attachments } = buildAppointmentEmail({ ...base, event: "CANCELED" });
      expect(attachments).toEqual([]);
      expect(html).not.toContain("Google Agenda");
      expect(text).not.toContain("Google Agenda");
    });
  });

  describe("identidade visual", () => {
    it("mostra a logo no topo e no rodapé, com as cores da marca", () => {
      const { html } = buildAppointmentEmail(base);
      expect(html.match(/brand\/email\/marquo-logo\.png/g)).toHaveLength(2);
      expect(html).toContain("#6C3BF4");
      expect(html).toContain("#F1ECFF");
    });

    it("sem URL de logo, cai no nome em texto (imagem é opcional)", () => {
      const { html } = buildAppointmentEmail({ ...base, logoUrl: undefined });
      expect(html).not.toContain("<img");
      expect(html).toContain("Marquo");
    });
  });

  // Segurança: nomes são digitados por usuários e o e-mail é lido por OUTRA pessoa.
  it("escapa HTML em nome de cliente, salão, profissional, serviço e endereço", () => {
    const evil = `<script>alert(1)</script>`;
    const { html } = buildAppointmentEmail({
      ...base,
      audience: "CLIENT",
      clientName: evil,
      tenantName: evil,
      professionalName: evil,
      serviceNames: [evil],
      tenantAddress: evil,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapa aspas no link para não escapar do atributo href", () => {
    const { html } = buildAppointmentEmail({ ...base, dashboardUrl: `https://x.com/"><script>` });
    expect(html).not.toContain(`"><script>`);
  });

  it("sem link configurado, o e-mail sai sem o botão do painel", () => {
    const { html, text } = buildAppointmentEmail({ ...base, dashboardUrl: undefined });
    expect(html).not.toContain("Abrir a agenda");
    expect(text).not.toContain("Abrir a agenda");
  });
});

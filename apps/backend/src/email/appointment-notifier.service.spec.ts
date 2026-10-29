import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentNotifierService } from "./appointment-notifier.service";
import { EmailService } from "./email.service";

function hydrated(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    clientName: "João Silva",
    clientPhone: "11999998888",
    startAt: new Date("2026-03-10T17:30:00.000Z"),
    endAt: new Date("2026-03-10T18:30:00.000Z"),
    rescheduledCount: 0,
    items: [{ service: { name: "Corte" } }],
    professional: { user: { name: "Alex", email: "alex@salao.com", isActive: true } },
    tenant: {
      name: "Salão Teste",
      slug: "salao",
      address: "Rua A, 10",
      neighborhood: "Centro",
      city: "Cabo Frio",
      whatsappNumber: "5522999887766",
      notifyStaffByEmail: true,
      users: [{ email: "dono@salao.com" }],
    },
    client: { email: "ficha@cliente.com", consumerLink: { consumer: { email: "conta@cliente.com" } } },
    ...overrides,
  };
}

function build(appointment: unknown, configured = true) {
  const findFirst = jest.fn().mockResolvedValue(appointment);
  const prisma = { appointment: { findFirst } } as unknown as PrismaService;
  const send = jest.fn().mockResolvedValue(true);
  const email = { isConfigured: () => configured, send } as unknown as EmailService;
  const config = { get: (k: string) => (k === "FRONTEND_URL" ? "https://marquo.com.br/" : undefined) } as unknown as ConfigService;
  return { service: new AppointmentNotifierService(prisma, email, config), findFirst, send };
}

describe("AppointmentNotifierService.deliver", () => {
  it("busca o atendimento com tenantId no WHERE (nunca só por id)", async () => {
    const { service, findFirst } = build(hydrated());
    await service.deliver("CREATED", "appt-1", "tenant-1", "CLIENT");
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "appt-1", tenantId: "tenant-1" });
  });

  it("atendimento de outro tenant/inexistente: não envia nada", async () => {
    const { service, send } = build(null);
    await service.deliver("CREATED", "appt-1", "tenant-OUTRO", "CLIENT");
    expect(send).not.toHaveBeenCalled();
  });

  it("agendamento público: equipe (dono + profissional) recebe o aviso e o cliente a confirmação", async () => {
    const { service, send } = build(hydrated());

    await service.deliver("CREATED", "appt-1", "tenant-1", "CLIENT", { alsoConfirmToClient: true });

    expect(send).toHaveBeenCalledTimes(2);
    const recipients = send.mock.calls.map((c) => c[0].to);
    expect(recipients).toContainEqual(["dono@salao.com", "alex@salao.com"]);
    // E-mail da CONTA do cliente tem prioridade sobre o digitado na ficha.
    expect(recipients).toContainEqual(["conta@cliente.com"]);
    expect(send.mock.calls.find((c) => c[0].to[0] === "dono@salao.com")![0].subject).toContain("Novo agendamento");
  });

  it("cliente cancela/remarca: só a equipe é avisada", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CANCELED", "appt-1", "tenant-1", "CLIENT");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual(["dono@salao.com", "alex@salao.com"]);
  });

  it("equipe cancela/remarca/marca: só o cliente é avisado", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("RESCHEDULED", "appt-1", "tenant-1", "STAFF");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual(["conta@cliente.com"]);
  });

  it("sem conta de cliente usa o e-mail da ficha; sem nenhum, não envia ao cliente", async () => {
    const semConta = build(hydrated({ client: { email: "ficha@cliente.com", consumerLink: null } }));
    await semConta.service.deliver("CANCELED", "a", "t", "STAFF");
    expect(semConta.send.mock.calls[0][0].to).toEqual(["ficha@cliente.com"]);

    const semEmail = build(hydrated({ client: { email: null, consumerLink: null } }));
    await semEmail.service.deliver("CANCELED", "a", "t", "STAFF");
    expect(semEmail.send).not.toHaveBeenCalled();

    const semCliente = build(hydrated({ client: null }));
    await semCliente.service.deliver("CANCELED", "a", "t", "STAFF");
    expect(semCliente.send).not.toHaveBeenCalled();
  });

  it("profissional desativado não recebe o aviso (só o dono)", async () => {
    const { service, send } = build(
      hydrated({ professional: { user: { name: "Alex", email: "alex@salao.com", isActive: false } } }),
    );
    await service.deliver("CREATED", "a", "t", "CLIENT");
    expect(send.mock.calls[0][0].to).toEqual(["dono@salao.com"]);
  });

  it("a confirmação do cliente traz endereço e telefone do salão, convite de calendário e a logo", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CREATED", "appt-1", "tenant-1", "STAFF");

    const message = send.mock.calls[0][0];
    expect(message.text).toContain("Endereço: Rua A, 10, Centro, Cabo Frio");
    expect(message.text).toContain("Telefone: (22) 99988-7766");
    expect(message.attachments).toHaveLength(1);
    expect(message.html).toContain("https://marquo.com.br/brand/email/marquo-logo.png");
  });

  it("a equipe vê o telefone do cliente; o cliente não recebe o próprio telefone de volta", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CREATED", "appt-1", "tenant-1", "CLIENT", { alsoConfirmToClient: true });

    const toStaff = send.mock.calls.find((c) => c[0].to[0] === "dono@salao.com")![0];
    const toClient = send.mock.calls.find((c) => c[0].to[0] === "conta@cliente.com")![0];
    expect(toStaff.text).toContain("(11) 99999-8888");
    expect(toClient.text).not.toContain("99999-8888");
  });

  it("cancelamento sai sem anexo de calendário", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CANCELED", "appt-1", "tenant-1", "STAFF");
    expect(send.mock.calls[0][0].attachments).toEqual([]);
  });

  it("endereço vazio no cadastro do salão não gera linha de endereço", async () => {
    const tenant = { ...hydrated().tenant, address: null, neighborhood: " ", city: null };
    const { service, send } = build(hydrated({ tenant }));
    await service.deliver("CREATED", "appt-1", "tenant-1", "STAFF");
    expect(send.mock.calls[0][0].text).not.toContain("Endereço:");
  });

  it("o link do painel usa FRONTEND_URL sem barra dupla", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CREATED", "a", "t", "CLIENT");
    expect(send.mock.calls[0][0].text).toContain("https://marquo.com.br/dashboard/agenda");
  });
});


describe("AppointmentNotifierService.deliverReminder", () => {
  it("envia o lembrete só ao CLIENTE (nunca à equipe), com a conta do cliente à frente da ficha", async () => {
    const { service, send, findFirst } = build(hydrated());

    await expect(service.deliverReminder("appt-1", "tenant-1")).resolves.toBe("SENT");

    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "appt-1", tenantId: "tenant-1" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual(["conta@cliente.com"]);
    expect(send.mock.calls[0][0].subject).toContain("Lembrete");
  });

  it("sem e-mail do cliente: SKIPPED e nada é enviado", async () => {
    const { service, send } = build(hydrated({ client: { email: null, consumerLink: null } }));
    await expect(service.deliverReminder("appt-1", "tenant-1")).resolves.toBe("SKIPPED");
    expect(send).not.toHaveBeenCalled();
  });

  it("atendimento de outro tenant ou inexistente: SKIPPED", async () => {
    const { service, send } = build(null);
    await expect(service.deliverReminder("appt-1", "tenant-OUTRO")).resolves.toBe("SKIPPED");
    expect(send).not.toHaveBeenCalled();
  });

  it("provedor recusou o envio: FAILED", async () => {
    const { service, send } = build(hydrated());
    send.mockResolvedValue(false);
    await expect(service.deliverReminder("appt-1", "tenant-1")).resolves.toBe("FAILED");
  });
});

describe("AppointmentNotifierService: avisos da equipe", () => {
  it("recepção mexe na agenda de OUTRO profissional: ele é avisado (só ele, não o dono), e o cliente também", async () => {
    const { service, send } = build(hydrated());

    await service.deliver("RESCHEDULED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: true });

    const recipients = send.mock.calls.map((c) => c[0].to);
    expect(recipients).toContainEqual(["alex@salao.com"]);
    expect(recipients).toContainEqual(["conta@cliente.com"]);
    expect(recipients).not.toContainEqual(["dono@salao.com", "alex@salao.com"]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("o próprio profissional agendou para si (notifyProfessional falso): ele não recebe aviso do que ele fez", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CREATED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual(["conta@cliente.com"]);
  });

  it("profissional desativado não é avisado", async () => {
    const { service, send } = build(
      hydrated({ professional: { user: { name: "Alex", email: "alex@salao.com", isActive: false } } }),
    );
    await service.deliver("CREATED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: true });
    expect(send.mock.calls.map((c) => c[0].to)).not.toContainEqual(["alex@salao.com"]);
  });

  describe("dono desligou os avisos da equipe (notifyStaffByEmail = false)", () => {
    const off = () => hydrated({ tenant: { ...hydrated().tenant, notifyStaffByEmail: false } });

    it("agendamento público: ninguém da equipe recebe, mas o cliente continua recebendo a confirmação", async () => {
      const { service, send } = build(off());
      await service.deliver("CREATED", "appt-1", "tenant-1", "CLIENT", { alsoConfirmToClient: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].to).toEqual(["conta@cliente.com"]);
    });

    it("cliente cancela: a equipe não é avisada", async () => {
      const { service, send } = build(off());
      await service.deliver("CANCELED", "appt-1", "tenant-1", "CLIENT");
      expect(send).not.toHaveBeenCalled();
    });

    it("recepção remarca: o profissional não é avisado, o cliente sim", async () => {
      const { service, send } = build(off());
      await service.deliver("RESCHEDULED", "appt-1", "tenant-1", "STAFF", { notifyProfessional: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].to).toEqual(["conta@cliente.com"]);
    });

    it("o lembrete ao cliente também não depende dessa chave", async () => {
      const { service, send } = build(off());
      await expect(service.deliverReminder("appt-1", "tenant-1")).resolves.toBe("SENT");
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});

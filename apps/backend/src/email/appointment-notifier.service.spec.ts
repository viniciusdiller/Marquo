import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentNotifierService } from "./appointment-notifier.service";
import { EmailService } from "./email.service";

function hydrated(overrides: Record<string, unknown> = {}) {
  return {
    clientName: "João Silva",
    startAt: new Date("2026-03-10T17:30:00.000Z"),
    items: [{ service: { name: "Corte" } }],
    professional: { user: { name: "Alex", email: "alex@salao.com", isActive: true } },
    tenant: { name: "Salão Teste", slug: "salao", users: [{ email: "dono@salao.com" }] },
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

  it("o link do painel usa FRONTEND_URL sem barra dupla", async () => {
    const { service, send } = build(hydrated());
    await service.deliver("CREATED", "a", "t", "CLIENT");
    expect(send.mock.calls[0][0].text).toContain("https://marquo.com.br/dashboard/agenda");
  });
});

describe("AppointmentNotifierService.notify", () => {
  it("com e-mail desligado não toca no banco", () => {
    const { service, findFirst } = build(hydrated(), false);
    service.notify("CREATED", "a", "t", "CLIENT");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("erro de banco NÃO propaga (fire-and-forget)", async () => {
    const { service, findFirst } = build(hydrated());
    findFirst.mockRejectedValue(new Error("db fora"));
    expect(() => service.notify("CREATED", "a", "t", "CLIENT")).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

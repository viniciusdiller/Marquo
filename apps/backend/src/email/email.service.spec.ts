import { ConfigService } from "@nestjs/config";
import { EmailService } from "./email.service";

function build(env: Record<string, string | undefined>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new EmailService(config);
}

const message = { to: ["dono@salao.com"], subject: "Assunto", html: "<p>oi</p>", text: "oi" };
const configured = { RESEND_API_KEY: "re_chave_de_teste_123", EMAIL_FROM: "Marquo <avisos@marquo.com.br>" };

describe("EmailService", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("sem RESEND_API_KEY/EMAIL_FROM fica desligado: não chama a rede e devolve false", async () => {
    const service = build({});
    expect(service.isConfigured()).toBe(false);
    await expect(service.send(message)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia ao host fixo do Resend com Bearer e o remetente configurado", async () => {
    const service = build(configured);

    await expect(service.send(message)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_chave_de_teste_123");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("Marquo <avisos@marquo.com.br>");
    expect(body.to).toEqual(["dono@salao.com"]);
    expect(body.html).toBe("<p>oi</p>");
  });

  it("preserves the idempotency key and request body across retries", async () => {
    const service = build(configured);
    await service.send(message, "marquo-notification/job-1");
    await service.send(message, "marquo-notification/job-1");
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("marquo-notification/job-1");
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });

  it("normaliza, deduplica e limita os destinatários", async () => {
    const service = build(configured);
    await service.send({
      ...message,
      to: ["A@x.com", " a@x.com ", "", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]);
  });

  it("sem destinatário válido não chama o provedor", async () => {
    const service = build(configured);
    await expect(service.send({ ...message, to: ["", "  "] })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("remove quebras de linha do assunto (texto vem de nomes digitados por usuários)", async () => {
    const service = build(configured);
    await service.send({ ...message, subject: "Novo\r\nBcc: x@y.com agendamento" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).not.toMatch(/[\r\n]/);
  });

  it("resposta de erro do provedor devolve false e NÃO lança", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    await expect(build(configured).send(message)).resolves.toBe(false);
  });

  it("falha de rede/timeout devolve false e NÃO lança (e-mail não derruba o agendamento)", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(build(configured).send(message)).resolves.toBe(false);
  });
});

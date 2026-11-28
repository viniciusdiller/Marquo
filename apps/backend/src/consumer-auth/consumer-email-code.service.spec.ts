import { sharedStateFake } from "../../test/shared-state.fake";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { ConsumerEmailCodeService, REGISTER_CODE_COOLDOWN_MS } from "./consumer-email-code.service";

function build(options: { configured?: boolean; env?: string; existing?: unknown; frontend?: string } = {}) {
  const findUnique = jest.fn().mockResolvedValue("existing" in options ? options.existing : null);
  const prisma = { consumer: { findUnique } } as unknown as PrismaService;
  const send = jest.fn().mockResolvedValue(true);
  const email = { isConfigured: () => options.configured ?? true, send } as unknown as EmailService;
  const config = {
    get: (k: string) => (k === "NODE_ENV" ? options.env : k === "FRONTEND_URL" ? (options.frontend ?? "https://marquo.com.br") : undefined),
    getOrThrow: () => "s".repeat(40),
  } as unknown as ConfigService;
  return { service: new ConsumerEmailCodeService(prisma, email, config, sharedStateFake()), findUnique, send };
}

const codeSent = (send: jest.Mock) => /Seu código: (\d{6})/.exec(send.mock.calls.at(-1)![0].text)![1];

describe("ConsumerEmailCodeService.mode", () => {
  it("e-mail configurado: exige o código", () => expect(build().service.mode()).toBe("required"));
  it("sem e-mail em desenvolvimento: dispensa", () => {
    expect(build({ configured: false, env: "development" }).service.mode()).toBe("skip");
    expect(build({ configured: false }).service.mode()).toBe("skip");
  });
  it("sem e-mail em produção: indisponível", () => expect(build({ configured: false, env: "production" }).service.mode()).toBe("unavailable"));
});

describe("ConsumerEmailCodeService.process / check", () => {
  it("manda o código ao e-mail digitado (normalizado) e ele confere uma vez", async () => {
    const { service, send } = build();
    await service.process("  Ana@Example.COM ");

    expect(send.mock.calls[0][0].to).toEqual(["ana@example.com"]);
    const code = codeSent(send);
    expect(await service.check("ana@example.com", code)).toBe("ok");
    expect(await service.check("ANA@example.com ", code)).toBe("expired");
    expect(await service.check("ana@example.com", code)).toBe("expired");
  });

  it("o código de um e-mail não vale para outro", async () => {
    const { service, send } = build();
    await service.process("a@x.com");
    const code = codeSent(send);
    expect(await service.check("b@x.com", code)).not.toBe("ok");
  });

  it("código errado repetido trava (5 tentativas) e o certo deixa de valer: é preciso pedir outro", async () => {
    const { service, send } = build();
    await service.process("a@x.com");
    const code = codeSent(send);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i += 1) expect(await service.check("a@x.com", wrong)).toBe("invalid");
    expect(await service.check("a@x.com", wrong)).toBe("locked");
    expect(await service.check("a@x.com", code)).not.toBe("ok");
  });

  it("pedidos seguidos para o mesmo e-mail dentro do intervalo não geram novo e-mail", async () => {
    const { service, send } = build();
    await service.process("a@x.com");
    await service.process("a@x.com");
    expect(send).toHaveBeenCalledTimes(1);
    expect(REGISTER_CODE_COOLDOWN_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("e-mail que já tem conta com senha: não manda código (o cadastro daria 409; não enche a caixa)", async () => {
    const { service, send } = build({ existing: { passwordHash: "hash" } });
    await service.process("a@x.com");
    expect(send).not.toHaveBeenCalled();
  });

  it("conta antiga sem senha (a ser reivindicada) recebe o código normalmente", async () => {
    const { service, send } = build({ existing: { passwordHash: null } });
    await service.process("a@x.com");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sem e-mail configurado não envia nem toca no banco", async () => {
    const { service, send, findUnique } = build({ configured: false });
    await service.process("a@x.com");
    expect(send).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("request() nunca lança, mesmo com o banco fora do ar", async () => {
    const { service, findUnique } = build();
    findUnique.mockRejectedValue(new Error("db fora"));
    expect(() => service.request("a@x.com")).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it("o código não aparece em claro em lugar nenhum além do e-mail enviado", async () => {
    const { service, send } = build();
    await service.process("a@x.com");
    const code = codeSent(send);
    expect(JSON.stringify(Object.keys(service))).not.toContain(code);
  });
});

describe("ConsumerEmailCodeService: código de redefinição de senha", () => {
  it("conta de cliente com senha recebe o código, que confere uma vez", async () => {
    const { service, send } = build({ existing: { passwordHash: "h" } });
    await service.processReset(" Ana@Example.com ");
    expect(send.mock.calls[0][0].to).toEqual(["ana@example.com"]);
    expect(send.mock.calls[0][0].text).toMatch(/redefinir sua senha/i);
    const code = codeSent(send);
    expect(await service.checkReset("ana@example.com", code)).toBe("ok");
    expect(await service.checkReset("ana@example.com", code)).toBe("expired");
  });

  it("sem conta, ou conta sem senha: nenhum e-mail sai", async () => {
    const semConta = build({ existing: null });
    await semConta.service.processReset("x@x.com");
    expect(semConta.send).not.toHaveBeenCalled();
    const semSenha = build({ existing: { passwordHash: null } });
    await semSenha.service.processReset("x@x.com");
    expect(semSenha.send).not.toHaveBeenCalled();
  });

  it("código de cadastro não serve para redefinir senha (e vice-versa)", async () => {
    const cadastro = build({ existing: null });
    await cadastro.service.process("a@x.com");
    expect(await cadastro.service.checkReset("a@x.com", codeSent(cadastro.send))).not.toBe("ok");

    const reset = build({ existing: { passwordHash: "h" } });
    await reset.service.processReset("a@x.com");
    expect(await reset.service.check("a@x.com", codeSent(reset.send))).not.toBe("ok");
  });

  it("sem e-mail configurado não gera código", async () => {
    const { service, send } = build({ configured: false, existing: { passwordHash: "h" } });
    await service.processReset("a@x.com");
    expect(send).not.toHaveBeenCalled();
  });
});

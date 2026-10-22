import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";
import { PasswordResetService, RESET_COOLDOWN_MS, RESET_TTL_MS } from "./password-reset.service";

const NOW = new Date("2026-10-22T12:00:00.000Z");

function build(options: { user?: unknown; configured?: boolean; updateCount?: number; frontend?: string | undefined } = {}) {
  const findUnique = jest.fn().mockResolvedValue(
    "user" in options
      ? options.user
      : { id: "u-1", name: "Dona Ana", email: "ana@salao.com", isActive: true, passwordSetTokenExpiresAt: null },
  );
  const updateMany = jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 });
  const prisma = { user: { findUnique, updateMany } } as unknown as PrismaService;
  const send = jest.fn().mockResolvedValue(true);
  const email = { isConfigured: () => options.configured ?? true, send } as unknown as EmailService;
  const frontend = "frontend" in options ? options.frontend : "https://marquo.com.br/";
  const config = { get: (k: string) => (k === "FRONTEND_URL" ? frontend : undefined) } as unknown as ConfigService;
  return { service: new PasswordResetService(prisma, email, config), findUnique, updateMany, send };
}

describe("PasswordResetService.process", () => {
  it("conta ativa: grava só o HASH do token (1 h de validade) e envia o link em claro por e-mail", async () => {
    const { service, updateMany, send } = build();

    await service.process("ana@salao.com", NOW);

    const data = updateMany.mock.calls[0][0].data;
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "u-1", isActive: true });
    expect(data.passwordSetTokenExpiresAt).toEqual(new Date(NOW.getTime() + RESET_TTL_MS));

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toEqual(["ana@salao.com"]);
    const token = /definir-senha\?token=([0-9a-f]{64})/.exec(message.text)?.[1];
    expect(token).toBeDefined();
    // O que vai ao banco é o hash do token do e-mail, nunca o token.
    expect(data.passwordSetTokenHash).toBe(hashPasswordSetToken(token!));
    expect(data.passwordSetTokenHash).not.toBe(token);
    expect(message.text).toContain("60 minutos");
  });

  it("e-mail não cadastrado: não grava nada e não envia (resposta HTTP é a mesma)", async () => {
    const { service, updateMany, send } = build({ user: null });
    await service.process("ninguem@x.com", NOW);
    expect(updateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("conta desativada não recebe link de recuperação", async () => {
    const { service, updateMany, send } = build({
      user: { id: "u-1", name: "X", email: "x@x.com", isActive: false, passwordSetTokenExpiresAt: null },
    });
    await service.process("x@x.com", NOW);
    expect(updateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("conta desativada entre a leitura e a escrita (count 0): não envia o e-mail", async () => {
    const { service, send } = build({ updateCount: 0 });
    await service.process("ana@salao.com", NOW);
    expect(send).not.toHaveBeenCalled();
  });

  it("cooldown: pedido dentro de 2 minutos do anterior não gera novo e-mail", async () => {
    // Token emitido há 30 s por este fluxo: expira em (agora + TTL - 30 s).
    const issued = new Date(NOW.getTime() + RESET_TTL_MS - 30_000);
    const { service, updateMany, send } = build({
      user: { id: "u-1", name: "Ana", email: "ana@salao.com", isActive: true, passwordSetTokenExpiresAt: issued },
    });
    await service.process("ana@salao.com", NOW);
    expect(updateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("depois do cooldown um novo pedido gera outro link (e invalida o anterior)", async () => {
    const issued = new Date(NOW.getTime() + RESET_TTL_MS - RESET_COOLDOWN_MS - 1_000);
    const { service, send } = build({
      user: { id: "u-1", name: "Ana", email: "ana@salao.com", isActive: true, passwordSetTokenExpiresAt: issued },
    });
    await service.process("ana@salao.com", NOW);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("link de 24 h gerado pelo suporte não bloqueia o pedido do próprio usuário", async () => {
    const supportLink = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const { service, send } = build({
      user: { id: "u-1", name: "Ana", email: "ana@salao.com", isActive: true, passwordSetTokenExpiresAt: supportLink },
    });
    await service.process("ana@salao.com", NOW);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sem e-mail configurado não toca no banco (o reset manual do suporte continua valendo)", async () => {
    const { service, findUnique, send } = build({ configured: false });
    await service.process("ana@salao.com", NOW);
    expect(findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sem FRONTEND_URL não envia link quebrado", async () => {
    const { service, send } = build({ frontend: undefined });
    await service.process("ana@salao.com", NOW);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("PasswordResetService.request", () => {
  it("nunca lança, mesmo com o banco fora do ar (fire-and-forget)", async () => {
    const { service, findUnique } = build();
    findUnique.mockRejectedValue(new Error("db fora"));
    expect(() => service.request("ana@salao.com")).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

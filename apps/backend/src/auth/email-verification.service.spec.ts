import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { hashPasswordSetToken } from "../common/utils/password-set-token.util";
import {
  EmailVerificationService,
  newVerificationToken,
  VERIFICATION_COOLDOWN_MS,
  VERIFICATION_TTL_MS,
} from "./email-verification.service";

const NOW = new Date("2026-10-22T12:00:00.000Z");

function build(options: { user?: unknown; configured?: boolean; env?: string; updateCount?: number; frontend?: string | undefined } = {}) {
  const findUnique = jest.fn().mockResolvedValue(
    "user" in options
      ? options.user
      : { id: "u-1", name: "Ana", email: "ana@salao.com", isActive: true, emailVerifiedAt: null, emailVerificationExpiresAt: null },
  );
  const updateMany = jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 });
  const prisma = { user: { findUnique, updateMany } } as unknown as PrismaService;
  const send = jest.fn().mockResolvedValue(true);
  const email = { isConfigured: () => options.configured ?? true, send } as unknown as EmailService;
  const frontend = "frontend" in options ? options.frontend : "https://marquo.com.br/";
  const config = {
    get: (k: string) => (k === "FRONTEND_URL" ? frontend : k === "NODE_ENV" ? options.env : undefined),
  } as unknown as ConfigService;
  return { service: new EmailVerificationService(prisma, email, config), findUnique, updateMany, send };
}

describe("newVerificationToken", () => {
  it("token de 64 hex, hash sha256 e validade de 24 h", () => {
    const { token, hash, expiresAt } = newVerificationToken(NOW);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashPasswordSetToken(token));
    expect(hash).not.toBe(token);
    expect(expiresAt).toEqual(new Date(NOW.getTime() + VERIFICATION_TTL_MS));
  });
});

describe("EmailVerificationService.mode", () => {
  it("e-mail configurado: exige confirmar", () => {
    expect(build({ configured: true }).service.mode()).toBe("verify");
  });
  it("sem e-mail em desenvolvimento: dispensa (a conta nasce confirmada)", () => {
    expect(build({ configured: false, env: "development" }).service.mode()).toBe("skip");
    expect(build({ configured: false, env: undefined }).service.mode()).toBe("skip");
  });
  it("sem e-mail em PRODUÇÃO: indisponível (fail closed)", () => {
    expect(build({ configured: false, env: "production" }).service.mode()).toBe("unavailable");
  });
});

describe("EmailVerificationService.verify", () => {
  it("confirma com UM update condicional (hash + validade + conta ativa) e limpa o token", async () => {
    const { service, updateMany } = build();
    await expect(service.verify("tok123", NOW)).resolves.toBeUndefined();

    const call = updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      emailVerificationTokenHash: hashPasswordSetToken("tok123"),
      emailVerificationExpiresAt: { gt: NOW },
      isActive: true,
    });
    expect(call.data).toEqual({ emailVerifiedAt: NOW, emailVerificationTokenHash: null, emailVerificationExpiresAt: null });
  });

  it("token inválido, vencido, já usado ou de conta desativada: 400 (count 0)", async () => {
    const { service } = build({ updateCount: 0 });
    await expect(service.verify("qualquer", NOW)).rejects.toThrow(BadRequestException);
  });

  it("nunca procura o token em claro", async () => {
    const { service, updateMany } = build();
    await service.verify("segredo-em-claro", NOW);
    expect(JSON.stringify(updateMany.mock.calls[0][0].where)).not.toContain("segredo-em-claro");
  });
});

describe("EmailVerificationService.process (reenvio)", () => {
  it("conta ativa sem confirmação: novo token (só o hash no banco) e e-mail com o link", async () => {
    const { service, updateMany, send } = build();
    await service.process("ana@salao.com", NOW);

    const data = updateMany.mock.calls[0][0].data;
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "u-1", isActive: true, emailVerifiedAt: null });
    const message = send.mock.calls[0][0];
    const token = /verificar-email\?token=([0-9a-f]{64})/.exec(message.text)?.[1];
    expect(token).toBeDefined();
    expect(data.emailVerificationTokenHash).toBe(hashPasswordSetToken(token!));
    expect(message.to).toEqual(["ana@salao.com"]);
  });

  it("silêncio para e-mail inexistente, conta desativada ou já confirmada", async () => {
    for (const user of [
      null,
      { id: "u", name: "A", email: "a@x.com", isActive: false, emailVerifiedAt: null, emailVerificationExpiresAt: null },
      { id: "u", name: "A", email: "a@x.com", isActive: true, emailVerifiedAt: new Date(), emailVerificationExpiresAt: null },
    ]) {
      const { service, updateMany, send } = build({ user });
      await service.process("a@x.com", NOW);
      expect(updateMany).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("cooldown: não reenvia dentro de 2 minutos", async () => {
    const issued = new Date(NOW.getTime() + VERIFICATION_TTL_MS - 30_000);
    const { service, send } = build({
      user: { id: "u", name: "A", email: "a@x.com", isActive: true, emailVerifiedAt: null, emailVerificationExpiresAt: issued },
    });
    await service.process("a@x.com", NOW);
    expect(send).not.toHaveBeenCalled();
  });

  it("passado o cooldown, reenvia", async () => {
    const issued = new Date(NOW.getTime() + VERIFICATION_TTL_MS - VERIFICATION_COOLDOWN_MS - 1_000);
    const { service, send } = build({
      user: { id: "u", name: "A", email: "a@x.com", isActive: true, emailVerifiedAt: null, emailVerificationExpiresAt: issued },
    });
    await service.process("a@x.com", NOW);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sem e-mail configurado não toca no banco", async () => {
    const { service, findUnique } = build({ configured: false });
    await service.process("ana@salao.com", NOW);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("request() nunca lança, mesmo com o banco fora do ar", async () => {
    const { service, findUnique } = build();
    findUnique.mockRejectedValue(new Error("db fora"));
    expect(() => service.request("ana@salao.com")).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

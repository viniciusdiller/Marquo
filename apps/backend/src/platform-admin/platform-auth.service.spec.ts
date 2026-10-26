import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PlatformAuthService, PlatformChallenge, PlatformSession, TWO_FACTOR_INVALID_MESSAGE } from "./platform-auth.service";
import { EmailService } from "../email/email.service";
import { LOCKOUT_THRESHOLD } from "../common/utils/lockout.util";

// O login compara com bcrypt de custo 12 (o hash dummy do service), e os testes de bloqueio fazem
// várias tentativas seguidas: sob a suíte inteira em paralelo isso passa dos 5 s padrão do jest.
jest.setTimeout(60_000);

const PASSWORD = "senha-da-plataforma-123";
const HASH = bcrypt.hashSync(PASSWORD, 4);
const EMAIL = "admin@marquo.com.br";

function build(over: Record<string, string | undefined> = {}, sendResult = true) {
  const values: Record<string, string | undefined> = {
    JWT_SECRET: "s".repeat(40),
    PLATFORM_ADMIN_EMAIL: EMAIL,
    PLATFORM_ADMIN_PASSWORD_HASH: HASH,
    ...over,
  };
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key] as string,
  } as unknown as ConfigService;
  const send = jest.fn().mockResolvedValue(sendResult);
  const email = { send, isConfigured: () => true } as unknown as EmailService;
  const service = new PlatformAuthService(config, new JwtService({}), email);
  return Object.assign(service, { send });
}

// Sessão (login sem 2FA ou depois do código); o desafio do 2FA tem outro formato.
const asSession = (value: unknown) => value as PlatformSession;

describe("PlatformAuthService.login", () => {
  it("emite sessão curta para e-mail + senha corretos (e-mail case-insensitive)", async () => {
    const result = asSession(await build().login(" Admin@Marquo.com.br ", PASSWORD));
    expect(result.email).toBe(EMAIL);
    expect(result.expiresInSeconds).toBeLessThanOrEqual(2 * 60 * 60);
    expect(result.accessToken.split(".")).toHaveLength(3);
  });

  it("recusa senha errada com mensagem genérica", async () => {
    await expect(build().login(EMAIL, "errada")).rejects.toThrow(UnauthorizedException);
  });

  it("recusa e-mail que não é o da conta com a MESMA mensagem (sem revelar qual e-mail vale)", async () => {
    const service = build();
    const wrongPassword = await service.login(EMAIL, "errada").catch((e: Error) => e.message);
    const wrongEmail = await service.login("outro@x.com", PASSWORD).catch((e: Error) => e.message);
    expect(wrongEmail).toBe(wrongPassword);
  });

  it("painel desligado: nenhuma credencial entra", async () => {
    const off = build({ PLATFORM_ADMIN_EMAIL: undefined, PLATFORM_ADMIN_PASSWORD_HASH: undefined });
    await expect(off.login(EMAIL, PASSWORD)).rejects.toThrow(UnauthorizedException);
  });

  it("não aceita o hash no lugar da senha", async () => {
    await expect(build().login(EMAIL, HASH)).rejects.toThrow(UnauthorizedException);
  });

  // Lockout progressivo: depois de LOCKOUT_THRESHOLD falhas nem a senha CERTA entra durante o bloqueio.
  it("bloqueia a conta após falhas repetidas, inclusive para a senha correta", async () => {
    const service = build();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      await service.login(EMAIL, "errada").catch(() => undefined);
    }
    await expect(service.login(EMAIL, PASSWORD)).rejects.toThrow(UnauthorizedException);
  });

  it("um login correto zera o contador de falhas", async () => {
    const service = build();
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i += 1) {
      await service.login(EMAIL, "errada").catch(() => undefined);
    }
    await service.login(EMAIL, PASSWORD);
    await service.login(EMAIL, "errada").catch(() => undefined);
    await expect(service.login(EMAIL, PASSWORD)).resolves.toBeDefined();
  });

  it("e-mails que não são o da conta não contam para o bloqueio", async () => {
    const service = build();
    for (let i = 0; i < LOCKOUT_THRESHOLD + 3; i += 1) {
      await service.login(`x${i}@spam.com`, "qualquer").catch(() => undefined);
    }
    await expect(service.login(EMAIL, PASSWORD)).resolves.toBeDefined();
  });
});

// ───────── Segundo fator por e-mail ─────────
describe("PlatformAuthService: 2FA por e-mail (PLATFORM_ADMIN_2FA=email)", () => {
  const TWO_FA = { PLATFORM_ADMIN_2FA: "email", FRONTEND_URL: "https://marquo.com.br" };

  // O código só existe no e-mail: o teste o lê da mensagem enviada, como o admin faria.
  async function startChallenge(service: ReturnType<typeof build>) {
    const challenge = (await service.login(EMAIL, PASSWORD)) as PlatformChallenge;
    const code = /Seu código: (\d{6})/.exec(service.send.mock.calls.at(-1)![0].text)![1];
    return { challenge, code };
  }

  it("senha certa NÃO devolve sessão: devolve um desafio e manda o código ao e-mail da conta", async () => {
    const service = build(TWO_FA);
    const result = await service.login(EMAIL, PASSWORD);

    expect(result).not.toHaveProperty("accessToken");
    expect(result).toMatchObject({ requiresCode: true, expiresInSeconds: 600 });
    expect((result as PlatformChallenge).challengeId).toMatch(/^[0-9a-f]{48}$/);
    expect(service.send).toHaveBeenCalledTimes(1);
    expect(service.send.mock.calls[0][0].to).toEqual([EMAIL]);
    expect(service.send.mock.calls[0][0].text).toMatch(/Seu código: \d{6}/);
  });

  it("código certo entrega a sessão (e só uma vez)", async () => {
    const service = build(TWO_FA);
    const { challenge, code } = await startChallenge(service);

    const session = await service.verifyCode(challenge.challengeId, code);
    expect(session.email).toBe(EMAIL);
    expect(session.accessToken.split(".")).toHaveLength(3);

    await expect(service.verifyCode(challenge.challengeId, code)).rejects.toThrow(UnauthorizedException);
  });

  it("código errado: 401 com mensagem genérica, e o desafio continua valendo para o código certo", async () => {
    const service = build(TWO_FA);
    const { challenge, code } = await startChallenge(service);
    const wrong = code === "000000" ? "111111" : "000000";

    await expect(service.verifyCode(challenge.challengeId, wrong)).rejects.toThrow(TWO_FACTOR_INVALID_MESSAGE);
    await expect(service.verifyCode(challenge.challengeId, code)).resolves.toBeDefined();
  });

  it("5 códigos errados travam o desafio: nem o código certo vale mais", async () => {
    const service = build(TWO_FA);
    const { challenge, code } = await startChallenge(service);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) await service.verifyCode(challenge.challengeId, wrong).catch(() => undefined);

    await expect(service.verifyCode(challenge.challengeId, code)).rejects.toThrow(UnauthorizedException);
  });

  it("desafio inexistente ou inventado: 401", async () => {
    const service = build(TWO_FA);
    await expect(service.verifyCode("a".repeat(48), "123456")).rejects.toThrow(UnauthorizedException);
  });

  it("adivinhar códigos conta no bloqueio da conta: passado o limite, nem a senha certa inicia outro desafio", async () => {
    const service = build(TWO_FA);
    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      const { challenge, code } = await startChallenge(service);
      const wrong = code === "000000" ? "111111" : "000000";
      await service.verifyCode(challenge.challengeId, wrong).catch(() => undefined);
    }
    await expect(service.login(EMAIL, PASSWORD)).rejects.toThrow(UnauthorizedException);
  });

  // Se a senha certa zerasse o contador, quem sabe a senha burlaria o bloqueio entre as tentativas de código.
  it("a senha certa NÃO zera o contador de falhas quando o 2FA está ligado", async () => {
    const service = build(TWO_FA);
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i += 1) {
      await service.login(EMAIL, "errada").catch(() => undefined);
    }
    const { challenge, code } = await startChallenge(service);
    const wrong = code === "000000" ? "111111" : "000000";
    await service.verifyCode(challenge.challengeId, wrong).catch(() => undefined);

    // 4 senhas erradas + 1 código errado = 5: bloqueado.
    await expect(service.login(EMAIL, PASSWORD)).rejects.toThrow(UnauthorizedException);
  });

  it("e-mail do código não saiu (provedor falhou): 503 e o desafio é descartado", async () => {
    const service = build(TWO_FA, false);
    await expect(service.login(EMAIL, PASSWORD)).rejects.toThrow(ServiceUnavailableException);
  });

  it("senha errada não envia código nenhum", async () => {
    const service = build(TWO_FA);
    await service.login(EMAIL, "errada").catch(() => undefined);
    expect(service.send).not.toHaveBeenCalled();
  });

  it("2FA desligado: verifyCode não emite sessão e o login segue direto", async () => {
    const service = build();
    expect(asSession(await service.login(EMAIL, PASSWORD)).accessToken).toBeDefined();
    await expect(service.verifyCode("a".repeat(48), "123456")).rejects.toThrow(UnauthorizedException);
    expect(service.send).not.toHaveBeenCalled();
  });

  it("o código nunca vai para o log nem fica em claro na resposta do login", async () => {
    const service = build(TWO_FA);
    const result = await service.login(EMAIL, PASSWORD);
    const code = /Seu código: (\d{6})/.exec(service.send.mock.calls[0][0].text)![1];
    expect(JSON.stringify(result)).not.toContain(code);
  });
});

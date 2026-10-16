import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PlatformAuthService } from "./platform-auth.service";
import { LOCKOUT_THRESHOLD } from "../common/utils/lockout.util";

// O login compara com bcrypt de custo 12 (o hash dummy do service), e os testes de bloqueio fazem
// várias tentativas seguidas: sob a suíte inteira em paralelo isso passa dos 5 s padrão do jest.
jest.setTimeout(60_000);

const PASSWORD = "senha-da-plataforma-123";
const HASH = bcrypt.hashSync(PASSWORD, 4);
const EMAIL = "admin@marquo.com.br";

function build(over: Record<string, string | undefined> = {}) {
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
  return new PlatformAuthService(config, new JwtService({}));
}

describe("PlatformAuthService.login", () => {
  it("emite sessão curta para e-mail + senha corretos (e-mail case-insensitive)", async () => {
    const result = await build().login(" Admin@Marquo.com.br ", PASSWORD);
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

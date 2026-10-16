import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { platformPasswordVersion, platformSigningKey } from "./platform-admin.config";

const JWT_SECRET = "s".repeat(40);
const HASH = bcrypt.hashSync("senha-da-plataforma-123", 4);
const EMAIL = "admin@marquo.com.br";

function config(over: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    JWT_SECRET,
    PLATFORM_ADMIN_EMAIL: EMAIL,
    PLATFORM_ADMIN_PASSWORD_HASH: HASH,
    ...over,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!values[key]) throw new Error(key);
      return values[key];
    },
  } as unknown as ConfigService;
}

const jwt = new JwtService({});

function run(header: string | undefined, cfg = config()) {
  const request: Record<string, unknown> = { headers: { authorization: header } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const guard = new PlatformAdminGuard(jwt, cfg);
  return { run: () => guard.canActivate(context), request };
}

function platformToken(over: Record<string, unknown> = {}, secret = platformSigningKey(config())) {
  return jwt.sign(
    { sub: "platform-admin", type: "platform", email: EMAIL, pv: platformPasswordVersion(HASH), ...over },
    { secret, expiresIn: 60 },
  );
}

describe("PlatformAdminGuard", () => {
  it("aceita token válido e expõe o e-mail da conta", () => {
    const { run: call, request } = run(`Bearer ${platformToken()}`);
    expect(call()).toBe(true);
    expect(request.platformAdmin).toEqual({ email: EMAIL });
  });

  it("recusa sem cabeçalho Bearer", () => {
    expect(run(undefined).run).toThrow(UnauthorizedException);
  });

  // Regressão central da terceira identidade: um token de STAFF/cliente é assinado com o JWT_SECRET
  // puro. Mesmo com payload `type: "platform"` forjado, a chave derivada é outra.
  it("recusa token assinado com o JWT_SECRET puro (staff/cliente), mesmo com payload de plataforma", () => {
    const forged = platformToken({}, JWT_SECRET);
    expect(run(`Bearer ${forged}`).run).toThrow(UnauthorizedException);
  });

  it("recusa token de staff comum (type diferente)", () => {
    const staff = platformToken({ type: "access", sub: "user-1" });
    expect(run(`Bearer ${staff}`).run).toThrow(UnauthorizedException);
  });

  it("recusa token expirado", () => {
    const expired = jwt.sign(
      { sub: "platform-admin", type: "platform", email: EMAIL, pv: platformPasswordVersion(HASH) },
      { secret: platformSigningKey(config()), expiresIn: -10 },
    );
    expect(run(`Bearer ${expired}`).run).toThrow(UnauthorizedException);
  });

  it("recusa quando o e-mail da conta mudou no .env", () => {
    const { run: call } = run(`Bearer ${platformToken()}`, config({ PLATFORM_ADMIN_EMAIL: "outro@marquo.com.br" }));
    expect(call).toThrow(UnauthorizedException);
  });

  // Trocar a senha (novo hash) derruba as sessões abertas.
  it("recusa token emitido com o hash antigo (troca de senha derruba a sessão)", () => {
    const novoHash = bcrypt.hashSync("outra-senha-forte-456", 4);
    const { run: call } = run(`Bearer ${platformToken()}`, config({ PLATFORM_ADMIN_PASSWORD_HASH: novoHash }));
    expect(call).toThrow(UnauthorizedException);
  });

  it("recusa token sem pv", () => {
    expect(run(`Bearer ${platformToken({ pv: undefined })}`).run).toThrow(UnauthorizedException);
  });

  it("painel desligado (sem variáveis): recusa até token bem formado", () => {
    const { run: call } = run(
      `Bearer ${platformToken()}`,
      config({ PLATFORM_ADMIN_EMAIL: undefined, PLATFORM_ADMIN_PASSWORD_HASH: undefined }),
    );
    expect(call).toThrow(UnauthorizedException);
  });
});

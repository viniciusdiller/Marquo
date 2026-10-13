import "reflect-metadata";
import { Controller, Get, INestApplication, Post, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { InternalAuthGuard } from "./internal-auth.guard";
import {
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_TIMESTAMP_HEADER,
  signInternalRequest,
} from "./internal-signature.util";

const SECRET = "0123456789abcdef0123456789abcdef";

@Controller("internal")
class ProbeController {
  @Get("ping")
  ping() {
    return { ok: true };
  }

  @Post("echo")
  echo(@Req() req: { body: unknown }) {
    return { body: req.body };
  }
}

// secret: null = INTERNAL_API_SECRET não configurado (undefined acionaria o valor padrão do parâmetro).
async function buildApp(secret: string | null = SECRET) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
    providers: [
      { provide: ConfigService, useValue: { get: (key: string) => (key === "INTERNAL_API_SECRET" ? (secret ?? undefined) : undefined) } },
      InternalAuthGuard,
      { provide: APP_GUARD, useExisting: InternalAuthGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

function headersFor(method: string, path: string, body: string, ts = Date.now(), secret = SECRET) {
  return {
    [INTERNAL_TIMESTAMP_HEADER]: String(ts),
    [INTERNAL_SIGNATURE_HEADER]: signInternalRequest({ method, path, body, timestampMs: ts }, secret),
  };
}

describe("InternalAuthGuard (Nest real, corpo cru)", () => {
  let app: INestApplication;
  afterEach(async () => app?.close());

  it("GET assinado passa", async () => {
    app = await buildApp();
    const res = await request(app.getHttpServer()).get("/internal/ping?search=a").set(headersFor("GET", "/internal/ping?search=a", ""));
    expect(res.status).toBe(200);
  }, 15000);

  // O corpo assinado são os bytes CRUS: com espaços e acentos, para pegar reserialização de JSON.
  it("POST assinado com corpo JSON passa (assina os bytes crus, não o JSON reserializado)", async () => {
    app = await buildApp();
    const body = '{ "actor":  "ação@b.com" }';
    const res = await request(app.getHttpServer())
      .post("/internal/echo")
      .set("content-type", "application/json")
      .set(headersFor("POST", "/internal/echo", body))
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.body).toEqual({ actor: "ação@b.com" });
  });

  it.each([
    ["sem cabeçalhos", () => ({})],
    ["assinatura de outro segredo", () => headersFor("GET", "/internal/ping", "", Date.now(), "x".repeat(32))],
    ["timestamp expirado", () => headersFor("GET", "/internal/ping", "", Date.now() - 10 * 60_000)],
    ["assinatura de outra rota/query", () => headersFor("GET", "/internal/ping?search=a", "")],
  ])("%s: 403 genérico", async (_label, headers) => {
    app = await buildApp();
    const res = await request(app.getHttpServer()).get("/internal/ping").set(headers());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Acesso negado.");
  });

  it("corpo alterado depois de assinar: 403", async () => {
    app = await buildApp();
    const res = await request(app.getHttpServer())
      .post("/internal/echo")
      .set("content-type", "application/json")
      .set(headersFor("POST", "/internal/echo", '{"actor":"a@b.com"}'))
      .send('{"actor":"outro@b.com"}');
    expect(res.status).toBe(403);
  });

  // Uma requisição capturada não pode ser reenviada dentro da janela de 5 min.
  it("repetir EXATAMENTE a mesma requisição assinada: a segunda é 403", async () => {
    app = await buildApp();
    const headers = headersFor("GET", "/internal/ping", "");
    expect((await request(app.getHttpServer()).get("/internal/ping").set(headers)).status).toBe(200);
    expect((await request(app.getHttpServer()).get("/internal/ping").set(headers)).status).toBe(403);
  });

  it("sem INTERNAL_API_SECRET a API interna não existe: 403 mesmo com assinatura 'válida'", async () => {
    app = await buildApp(null);
    const res = await request(app.getHttpServer()).get("/internal/ping").set(headersFor("GET", "/internal/ping", ""));
    expect(res.status).toBe(403);
  });
});

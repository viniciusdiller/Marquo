import "reflect-metadata";
import { mkdirSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { validationExceptionFactory } from "./common/validation/pt-br-validation";
import { corsOrigins } from "./common/utils/cors-origins.util";
import { RejectUnsafeInputInterceptor } from "./common/interceptors/reject-unsafe-input.interceptor";
import { PtBrHttpExceptionFilter } from "./common/filters/pt-br-http-exception.filter";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter";
import { UPLOADS_DIR } from "./common/constants/uploads";

async function bootstrap() {
  // uploads/ fica no .gitignore (arquivos enviados pelos donos, não versionados), então não
  // existe em um clone novo — o ServeStaticModule (app.module.ts) precisa que exista.
  mkdirSync(UPLOADS_DIR, { recursive: true });

  // rawBody: a API interna de suporte (/internal/*, InternalAuthGuard) assina o HMAC sobre o hash do corpo
  // CRU; o parser guarda o Buffer em req.rawBody só para JSON/urlencoded (upload multipart não é afetado).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Cabeçalhos de segurança (nosniff, HSTS, frame-ancestors...). crossOriginResourcePolicy
  // cross-origin de propósito: logos/galeria em /uploads são <img> carregadas pelo frontend, que
  // roda em outra origem — o padrão "same-origin" do helmet quebraria todas as imagens.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // Atrás de proxy reverso/CDN, sem isso req.ip é o IP do proxy e o ThrottlerGuard (por IP)
  // passa a limitar TODOS os clientes juntos. Define quantos proxies confiar (não use `true`:
  // deixaria qualquer cliente forjar X-Forwarded-For e escapar do rate limit).
  if (process.env.TRUST_PROXY_HOPS) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS));
  }

  // O wizard público de agendamento (apps/frontend) chama os endpoints /public/* direto do
  // browser, já que não carregam dados sensíveis por trás de autenticação.
  // O site institucional (SITE_URL, opcional) só lê GET /plans para mostrar os mesmos preços do app.
  app.enableCors({ origin: corsOrigins(process.env), credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Mensagens em português (o frontend as mostra ao usuário); mesma forma de resposta.
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new PtBrHttpExceptionFilter(), new PrismaExceptionFilter());
  app.useGlobalInterceptors(new RejectUnsafeInputInterceptor());

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

bootstrap();

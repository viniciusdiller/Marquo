// Helpers dos smoke tests (E2E contra um backend REAL em execução — não roda no `jest`).
//
// Como rodar (use um banco/schema descartável, nunca o de desenvolvimento em uso):
//   1. DATABASE_URL com `?schema=e2e` + `prisma migrate deploy`; suba o backend (`node dist/main.js`) com
//      TRUST_PROXY_HOPS=1 (o script varia o IP de cada chamada via X-Forwarded-For para não bater no
//      limite de 10 tentativas/min das rotas de auth);
//      `ServiceCategory` (categorias do marketplace) só existe via `prisma db seed`, NÃO por
//      migration — sem rodar o seed (ou upsertar as categorias manualmente), os checks de
//      "busca pública do marketplace" em functional.mjs falham por não ter categoria pra
//      vincular (`updateMarketplace` exige cidade + ao menos 1 categoria pra listar).
//   2. API_URL=http://localhost:3101 node scripts/smoke/functional.mjs
//      API_URL=http://localhost:3101 node scripts/smoke/rotation.mjs   (lê DATABASE_URL e JWT_SECRET do .env)
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { readFileSync } from "node:fs";

export const API = process.env.API_URL ?? "http://localhost:3101";

export function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    // sem .env: usa só o ambiente
  }
  return env;
}

const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": randomIp(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

export function createChecker() {
  let pass = 0;
  const failures = [];
  return {
    check(name, cond, detail) {
      if (cond) {
        pass++;
        console.log("  ok  ", name);
      } else {
        failures.push(name);
        console.log("  FAIL", name, detail !== undefined ? JSON.stringify(detail).slice(0, 250) : "");
      }
    },
    finish() {
      console.log(`\n${pass} ok, ${failures.length} falhas`);
      if (failures.length) {
        console.log("Falhas:", failures);
        process.exit(1);
      }
    },
  };
}

export const claims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
export const LEGAL_VERSION = process.env.LEGAL_DOCS_VERSION ?? LEGAL_DOCS_VERSION;

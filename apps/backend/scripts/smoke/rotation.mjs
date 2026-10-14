// Rotação do refresh token de staff contra o backend real. Ver lib.mjs para como rodar. Precisa de
// DATABASE_URL e JWT_SECRET (lê apps/backend/.env): envelhece linhas no banco para simular a passagem do
// tempo (janela de tolerância de 60 s, teto de 90 dias) sem esperar de verdade.
import { createHash, createHmac } from "node:crypto";
import { PrismaClient } from "@marquo/database";
import { LEGAL_VERSION, call, claims, createChecker, loadEnv } from "./lib.mjs";

const env = loadEnv();
if (!env.DATABASE_URL || !env.JWT_SECRET) throw new Error("DATABASE_URL e JWT_SECRET são necessários (apps/backend/.env).");
process.env.DATABASE_URL = env.DATABASE_URL;
const prisma = new PrismaClient();
const { check, finish } = createChecker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIVE_MIN_AGO = () => new Date(Date.now() - 5 * 60_000);

const stamp = Date.now();
const email = `rot${stamp}@e2e.com`;
const password = "senha-forte-123";
let r = await call("POST", "/public/signup", { businessName: "Rotação " + stamp, ownerName: "Dona", email, password, acceptedTermsVersion: LEGAL_VERSION });
check("signup", r.status === 201, r);

console.log("== login e rotação básica");
r = await call("POST", "/auth/login", { email, password });
check("login devolve access + refresh", r.status === 200 && r.json?.accessToken && r.json?.refreshToken, r);
const t0 = r.json.refreshToken;
const c0 = claims(t0);
const userId = c0.sub;
check("refresh token tem jti e fid", !!c0.jti && !!c0.fid, c0);
check("access token funciona", (await call("GET", "/clients", undefined, r.json.accessToken)).status === 200);

r = await call("POST", "/auth/refresh", { refreshToken: t0 });
check("refresh #1 (t0 → t1)", r.status === 200, r);
const t1 = r.json.refreshToken;
const c1 = claims(t1);
check("t1 é outro token, MESMA família", c1.jti !== c0.jti && c1.fid === c0.fid);
check("access novo funciona", (await call("GET", "/clients", undefined, r.json.accessToken)).status === 200);

console.log("== tolerância a concorrência (Next dispara vários pedidos com o mesmo cookie)");
const [a, b, c] = await Promise.all([1, 2, 3].map(() => call("POST", "/auth/refresh", { refreshToken: t1 })));
check("3 refreshes simultâneos com t1: todos 200", [a, b, c].every((x) => x.status === 200), [a.status, b.status, c.status]);
check("cada um recebeu um token DIFERENTE, mesma família", new Set([a, b, c].map((x) => claims(x.json.refreshToken).jti)).size === 3 && [a, b, c].every((x) => claims(x.json.refreshToken).fid === c0.fid));

console.log("== segurança: cópia do token (reuso fora da janela)");
const t2 = a.json.refreshToken;
await prisma.refreshToken.update({ where: { id: c1.jti }, data: { usedAt: FIVE_MIN_AGO() } });
r = await call("POST", "/auth/refresh", { refreshToken: t1 });
check("ladrão reapresenta t1 (usado há 5 min) → 401", r.status === 401 && /Sessão expirada/.test(JSON.stringify(r.json)), r);
check("a família inteira caiu: o token novo do dono também → 401", (await call("POST", "/auth/refresh", { refreshToken: t2 })).status === 401);
check("nenhum token da família ficou ativo no banco", (await prisma.refreshToken.count({ where: { familyId: c0.fid, revokedAt: null } })) === 0);

console.log("== independência entre sessões");
const phone = (await call("POST", "/auth/login", { email, password })).json.refreshToken;
const laptop = (await call("POST", "/auth/login", { email, password })).json.refreshToken;
check("dois logins = duas famílias", claims(phone).fid !== claims(laptop).fid);
const p1 = (await call("POST", "/auth/refresh", { refreshToken: phone })).json.refreshToken;
await prisma.refreshToken.update({ where: { id: claims(phone).jti }, data: { usedAt: FIVE_MIN_AGO() } });
check("ataque na família do celular → 401", (await call("POST", "/auth/refresh", { refreshToken: phone })).status === 401);
check("o notebook (outra família) continua funcionando", (await call("POST", "/auth/refresh", { refreshToken: laptop })).status === 200);
check("o celular caiu (token novo também)", (await call("POST", "/auth/refresh", { refreshToken: p1 })).status === 401);

console.log("== logout revoga de verdade");
const lo = (await call("POST", "/auth/login", { email, password })).json.refreshToken;
check("logout → 204", (await call("POST", "/auth/logout", { refreshToken: lo })).status === 204);
check("depois do logout o refresh token não funciona", (await call("POST", "/auth/refresh", { refreshToken: lo })).status === 401);
check("logout com lixo → 204 igual (sem oráculo)", (await call("POST", "/auth/logout", { refreshToken: "lixo" })).status === 204);
check("logout repetido → 204", (await call("POST", "/auth/logout", { refreshToken: lo })).status === 204);

console.log("== formato antigo e adulterado");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", env.JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
};
check("refresh no formato ANTIGO (sem jti/fid), assinatura válida → 401", (await call("POST", "/auth/refresh", { refreshToken: sign({ sub: userId, type: "refresh" }) })).status === 401);
check("jti inventado → 401", (await call("POST", "/auth/refresh", { refreshToken: sign({ sub: userId, type: "refresh", jti: "inventado", fid: "x" }) })).status === 401);
check("assinatura adulterada → 401", (await call("POST", "/auth/refresh", { refreshToken: lo.slice(0, -3) + "abc" })).status === 401);
r = await call("POST", "/auth/login", { email, password });
check("access token NÃO serve como refresh", (await call("POST", "/auth/refresh", { refreshToken: r.json.accessToken })).status === 401);

console.log("== teto absoluto da sessão (90 dias)");
const old = (await call("POST", "/auth/login", { email, password })).json.refreshToken;
await prisma.refreshToken.update({ where: { id: claims(old).jti }, data: { familyStartedAt: new Date(Date.now() - 91 * 86400_000) } });
check("família com mais de 90 dias → 401 mesmo com o token válido", (await call("POST", "/auth/refresh", { refreshToken: old })).status === 401);

console.log("== redefinição de senha derruba todas as sessões");
const beforeReset = (await call("POST", "/auth/login", { email, password })).json.refreshToken;
const invite = "convite-" + stamp;
await prisma.user.update({ where: { id: userId }, data: { passwordSetTokenHash: createHash("sha256").update(invite).digest("hex"), passwordSetTokenExpiresAt: new Date(Date.now() + 3600_000) } });
await sleep(1100); // iat/passwordChangedAt comparam em segundos inteiros
r = await call("POST", "/auth/set-password", { token: invite, password: "nova-senha-456" });
check("set-password com o link", r.status === 200 && r.json?.refreshToken, r);
check("refresh token de ANTES da troca → 401", (await call("POST", "/auth/refresh", { refreshToken: beforeReset })).status === 401);
check("a sessão emitida pela troca funciona", (await call("POST", "/auth/refresh", { refreshToken: r.json.refreshToken })).status === 200);

console.log("== usuário desativado");
const rt = (await call("POST", "/auth/login", { email, password: "nova-senha-456" })).json.refreshToken;
await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
check("desativado: refresh → 401", (await call("POST", "/auth/refresh", { refreshToken: rt })).status === 401);
await prisma.user.update({ where: { id: userId }, data: { isActive: true } });

await prisma.$disconnect();
finish();

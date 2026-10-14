import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsp, generateNonce } from "./csp.ts";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(name + " "))?.slice(name.length + 1) ?? "";

describe("generateNonce", () => {
  it("é diferente a cada chamada e só tem caracteres seguros para o cabeçalho", () => {
    const a = generateNonce();
    const b = generateNonce();
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9+/=]+$/);
    assert.ok(a.length >= 40);
  });
});

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "abc123", isDev: false, apiUrl: "https://api.marquo.com.br" });

  it("script só com nonce + strict-dynamic: sem 'unsafe-inline' e sem 'unsafe-eval' em produção", () => {
    const script = directive(csp, "script-src");
    assert.match(script, /'nonce-abc123'/);
    assert.match(script, /'strict-dynamic'/);
    assert.doesNotMatch(script, /unsafe-inline/);
    assert.doesNotMatch(script, /unsafe-eval/);
  });

  it("em dev libera unsafe-eval (React remonta stack traces) e websocket do HMR", () => {
    const dev = buildCsp({ nonce: "n", isDev: true, apiUrl: "http://localhost:3001" });
    assert.match(directive(dev, "script-src"), /'unsafe-eval'/);
    assert.match(directive(dev, "connect-src"), /ws:/);
    assert.doesNotMatch(dev, /upgrade-insecure-requests/);
  });

  it("libera só a origem da API para chamadas do navegador e imagens de /uploads", () => {
    assert.match(directive(csp, "connect-src"), /https:\/\/api\.marquo\.com\.br/);
    assert.match(directive(csp, "img-src"), /https:\/\/api\.marquo\.com\.br/);
    assert.doesNotMatch(directive(csp, "connect-src"), /\*/);
  });

  it("mantém o que já protegia: sem frames de terceiros (exceto Maps), sem embed, sem base/form externos", () => {
    assert.equal(directive(csp, "frame-src"), "https://www.google.com");
    assert.equal(directive(csp, "frame-ancestors"), "'none'");
    assert.equal(directive(csp, "object-src"), "'none'");
    assert.equal(directive(csp, "base-uri"), "'self'");
    assert.equal(directive(csp, "form-action"), "'self'");
    assert.equal(directive(csp, "default-src"), "'self'");
  });

  it("upgrade-insecure-requests só em produção com API https (em http local quebraria as chamadas)", () => {
    assert.match(csp, /upgrade-insecure-requests/);
    const httpProd = buildCsp({ nonce: "n", isDev: false, apiUrl: "http://localhost:3101" });
    assert.doesNotMatch(httpProd, /upgrade-insecure-requests/);
  });

  it("URL da API inválida não derruba o CSP (só fica sem a origem extra)", () => {
    const broken = buildCsp({ nonce: "n", isDev: false, apiUrl: "não é url" });
    assert.match(broken, /default-src 'self'/);
    assert.equal(directive(broken, "connect-src"), "'self'");
  });

  it("o nonce nunca aparece fora do script-src", () => {
    const withoutScript = csp.split("; ").filter((d) => !d.startsWith("script-src")).join("; ");
    assert.doesNotMatch(withoutScript, /abc123/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCanonicalRedirect } from "./canonical-url.ts";

describe("getCanonicalRedirect", () => {
  it("redireciona host iniciado em www. para o apex com https", () => {
    assert.equal(
      getCanonicalRedirect("/", "www.marquo.com.br"),
      "https://marquo.com.br/",
    );
  });

  it("preserva rota interna e query strings no redirecionamento", () => {
    assert.equal(
      getCanonicalRedirect("/descobrir?cidade=SP&servico=barba", "www.marquo.com.br"),
      "https://marquo.com.br/descobrir?cidade=SP&servico=barba",
    );
  });

  it("trata maiúsculas e espaços no host", () => {
    assert.equal(
      getCanonicalRedirect("/para-donos", " WWW.MARQUO.COM.BR "),
      "https://marquo.com.br/para-donos",
    );
  });

  it("devolve null quando o host não começa com www.", () => {
    assert.equal(getCanonicalRedirect("/", "marquo.com.br"), null);
    assert.equal(getCanonicalRedirect("/dashboard", "localhost:3000"), null);
    assert.equal(getCanonicalRedirect("/", "192.168.1.10"), null);
    assert.equal(getCanonicalRedirect("/", "api.marquo.com.br"), null);
  });

  it("devolve null para host vazio ou indefinido", () => {
    assert.equal(getCanonicalRedirect("/", null), null);
    assert.equal(getCanonicalRedirect("/", undefined), null);
    assert.equal(getCanonicalRedirect("/", ""), null);
  });
});


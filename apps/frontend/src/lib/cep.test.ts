import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lookupCep, parseCepResponse } from "./cep.ts";

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("parseCepResponse", () => {
  it("lê rua, bairro, cidade e UF com os espaços normalizados", () => {
    assert.deepEqual(parseCepResponse({ logradouro: " Avenida  Paulista ", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }), {
      address: "Avenida Paulista",
      province: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("CEP inexistente ({ erro }) e corpo inesperado viram null", () => {
    assert.equal(parseCepResponse({ erro: true }), null);
    assert.equal(parseCepResponse({ erro: "true" }), null);
    assert.equal(parseCepResponse(null), null);
    assert.equal(parseCepResponse("lixo"), null);
    assert.equal(parseCepResponse({}), null);
  });

  it("ignora campos que não são texto e limita o tamanho", () => {
    const parsed = parseCepResponse({ logradouro: { x: 1 }, bairro: "b".repeat(500), localidade: "Cidade", uf: "SPX" });
    assert.equal(parsed?.address, "");
    assert.equal(parsed?.province.length, 80);
    assert.equal(parsed?.state, "SP");
  });
});

describe("lookupCep", () => {
  it("consulta só com 8 dígitos e monta a URL no host fixo", async () => {
    const urls: string[] = [];
    const spy = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ logradouro: "Rua A", bairro: "Centro", localidade: "Rio", uf: "RJ" }));
    }) as unknown as typeof fetch;
    const result = await lookupCep("01310-100", spy);
    assert.deepEqual(urls, ["https://viacep.com.br/ws/01310100/json/"]);
    assert.equal(result.ok && result.found && result.data.city, "Rio");
  });

  // Segurança: nada além de 8 dígitos chega à URL (sem path traversal nem troca de host) e nem chama a rede.
  it("entrada que não é CEP não chama a rede", async () => {
    let calls = 0;
    const spy = (async () => {
      calls += 1;
      return new Response("{}");
    }) as unknown as typeof fetch;
    for (const bad of ["", "123", "../../etc", "0131010099", "evil.com"]) {
      const result = await lookupCep(bad, spy);
      assert.deepEqual(result, { ok: true, found: false }, bad);
    }
    assert.equal(calls, 0);
  });

  // Segurança: texto estranho nunca chega à URL; só os 8 dígitos extraídos, sempre no host fixo.
  it("de uma entrada suja só os dígitos vão à URL, no host fixo", async () => {
    const urls: string[] = [];
    const spy = (async (url: string) => {
      urls.push(url);
      return new Response("{}");
    }) as unknown as typeof fetch;
    await lookupCep("01310100/../x", spy);
    await lookupCep("evil.com#12345678", spy);
    assert.deepEqual(urls, ["https://viacep.com.br/ws/01310100/json/", "https://viacep.com.br/ws/12345678/json/"]);
  });

  it("CEP que não existe: encontrado = false", async () => {
    assert.deepEqual(await lookupCep("99999999", reply({ erro: true })), { ok: true, found: false });
    assert.deepEqual(await lookupCep("99999999", reply({}, 400)), { ok: true, found: false });
  });

  it("serviço fora do ar, resposta quebrada ou erro de rede: ok = false (o dono digita à mão)", async () => {
    assert.deepEqual(await lookupCep("01310100", reply({}, 503)), { ok: false });
    assert.deepEqual(await lookupCep("01310100", (async () => new Response("não é json")) as unknown as typeof fetch), { ok: false });
    assert.deepEqual(await lookupCep("01310100", (async () => { throw new Error("rede"); }) as unknown as typeof fetch), { ok: false });
  });
});

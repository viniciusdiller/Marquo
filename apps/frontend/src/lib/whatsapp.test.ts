import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { whatsappLink } from "./whatsapp.ts";

describe("whatsappLink", () => {
  it("monta o link com DDI 55 a partir do telefone nacional", () => {
    assert.equal(whatsappLink("11912345678"), "https://wa.me/5511912345678");
    assert.equal(whatsappLink("1133334444"), "https://wa.me/551133334444");
  });

  it("aceita formatação e DDI já presente sem duplicar", () => {
    assert.equal(whatsappLink("(11) 91234-5678"), "https://wa.me/5511912345678");
    assert.equal(whatsappLink("5511912345678"), "https://wa.me/5511912345678");
  });

  it("codifica a mensagem pré-preenchida", () => {
    assert.equal(
      whatsappLink("11912345678", "Olá, tudo bem?"),
      "https://wa.me/5511912345678?text=Ol%C3%A1%2C%20tudo%20bem%3F",
    );
  });

  it("devolve null para vazio ou lixo (nunca um link para número impossível)", () => {
    assert.equal(whatsappLink(null), null);
    assert.equal(whatsappLink(""), null);
    assert.equal(whatsappLink("123"), null);
    assert.equal(whatsappLink("0011912345678"), null);
    assert.equal(whatsappLink("abc"), null);
  });
});

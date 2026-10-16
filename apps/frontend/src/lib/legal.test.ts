import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { LEGAL_DRAFT, hasPlaceholders, splitPlaceholders } from "./legal.ts";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "./legal-content.ts";

const allText = [...TERMS_SECTIONS, ...PRIVACY_SECTIONS].flatMap((section) => [
  section.title,
  ...section.paragraphs,
]);

describe("documentos legais", () => {
  // Trava de publicação: com lacunas abertas, o texto só pode ser servido como rascunho.
  it("não existe versão final (LEGAL_DRAFT = false) com lacunas em aberto", () => {
    if (!LEGAL_DRAFT) {
      const open = allText.filter(hasPlaceholders);
      assert.deepEqual(open, [], "preencha todas as lacunas antes de marcar LEGAL_DRAFT = false");
    }
  });

  it("a versão vigente é uma data AAAA-MM-DD válida", () => {
    assert.match(LEGAL_DOCS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(LEGAL_DOCS_VERSION)));
  });

  it("toda seção tem título e ao menos um parágrafo, sem duplicar título", () => {
    for (const sections of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      const titles = sections.map((section) => section.title);
      assert.equal(new Set(titles).size, titles.length, "títulos de seção repetidos");
      for (const section of sections) {
        assert.ok(section.title.trim().length > 0);
        assert.ok(section.paragraphs.length > 0);
        for (const paragraph of section.paragraphs) assert.ok(paragraph.trim().length > 0);
      }
    }
  });

  it("cita os pontos que o produto realmente implementa (trial de 14 dias, provedor de pagamentos, LGPD)", () => {
    const terms = TERMS_SECTIONS.flatMap((s) => s.paragraphs).join(" ");
    const privacy = PRIVACY_SECTIONS.flatMap((s) => s.paragraphs).join(" ");
    assert.match(terms, /14 dias/);
    assert.match(terms, /provedor de pagamentos/);
    assert.match(privacy, /LGPD/);
    assert.match(privacy, /hash/);
  });
});

describe("splitPlaceholders", () => {
  it("separa texto comum das lacunas, na ordem", () => {
    assert.deepEqual(splitPlaceholders("Somos [PREENCHER: razão social], CNPJ [DECIDIR: x]."), [
      { text: "Somos ", placeholder: false },
      { text: "[PREENCHER: razão social]", placeholder: true },
      { text: ", CNPJ ", placeholder: false },
      { text: "[DECIDIR: x]", placeholder: true },
      { text: ".", placeholder: false },
    ]);
  });

  it("texto sem lacuna volta inteiro e colchetes comuns não contam", () => {
    assert.deepEqual(splitPlaceholders("texto [nota] normal"), [
      { text: "texto [nota] normal", placeholder: false },
    ]);
    assert.equal(hasPlaceholders("texto [nota] normal"), false);
    assert.equal(hasPlaceholders("tem [REVISAR: algo]"), true);
  });

  it("string vazia não gera partes", () => {
    assert.deepEqual(splitPlaceholders(""), []);
  });
});

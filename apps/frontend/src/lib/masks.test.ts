import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCep,
  formatCPF,
  formatCpfCnpj,
  formatMoneyInput,
  formatPhoneBR,
  hasCpfOrCnpjLength,
  moneyToCents,
  nationalPhoneDigits,
  normalizeInstagram,
  parseCoordinate,
  parseIntStrict,
  whatsappDigits,
} from "./masks.ts";

describe("formatPhoneBR", () => {
  it("formata celular e fixo enquanto digita", () => {
    assert.equal(formatPhoneBR(""), "");
    assert.equal(formatPhoneBR("1"), "(1");
    assert.equal(formatPhoneBR("11"), "(11");
    assert.equal(formatPhoneBR("119"), "(11) 9");
    assert.equal(formatPhoneBR("1191234"), "(11) 9123-4");
    assert.equal(formatPhoneBR("11912345678"), "(11) 91234-5678");
    assert.equal(formatPhoneBR("1132345678"), "(11) 3234-5678");
  });

  // Regressão: colar "+55 11 91234-5678" cortava os dígitos e virava "(55) 11912-3456".
  it("descarta o DDI 55 ao colar", () => {
    assert.equal(formatPhoneBR("+55 11 91234-5678"), "(11) 91234-5678");
    assert.equal(formatPhoneBR("5511912345678"), "(11) 91234-5678");
  });

  it("ignora letras e limita a 11 dígitos", () => {
    assert.equal(formatPhoneBR("(11) 91234-5678999"), "(11) 91234-5678");
    assert.equal(formatPhoneBR("abc"), "");
    assert.equal(nationalPhoneDigits("119123456789012"), "11912345678");
  });

  it("é idempotente (formatar o já formatado não muda)", () => {
    assert.equal(formatPhoneBR(formatPhoneBR("11912345678")), "(11) 91234-5678");
  });
});

describe("whatsappDigits", () => {
  it("devolve dígitos com DDI 55, sem duplicar", () => {
    assert.equal(whatsappDigits("(11) 91234-5678"), "5511912345678");
    assert.equal(whatsappDigits("+55 (11) 91234-5678"), "5511912345678");
    assert.equal(whatsappDigits("1132345678"), "551132345678");
  });

  it("recusa número que o backend recusaria", () => {
    assert.equal(whatsappDigits(""), "");
    assert.equal(whatsappDigits("123"), "");
    assert.equal(whatsappDigits("(11) 81234-5678"), ""); // celular sem 9
    assert.equal(whatsappDigits("(01) 91234-5678"), ""); // DDD com zero
  });
});

describe("formatCPF", () => {
  it("formata progressivamente e limita a 11 dígitos", () => {
    assert.equal(formatCPF("529"), "529");
    assert.equal(formatCPF("5299"), "529.9");
    assert.equal(formatCPF("52998224725"), "529.982.247-25");
    assert.equal(formatCPF("52998224725999"), "529.982.247-25");
  });
});

describe("formatCpfCnpj", () => {
  it("até 11 dígitos formata como CPF", () => {
    assert.equal(formatCpfCnpj("529"), "529");
    assert.equal(formatCpfCnpj("52998224725"), "529.982.247-25");
  });

  it("de 12 a 14 dígitos vira CNPJ, progressivamente, e limita a 14", () => {
    assert.equal(formatCpfCnpj("529982247259"), "52.998.224/7259");
    assert.equal(formatCpfCnpj("11222333000181"), "11.222.333/0001-81");
    assert.equal(formatCpfCnpj("11222333000181999"), "11.222.333/0001-81");
  });

  it("ignora tudo que não é dígito", () => {
    assert.equal(formatCpfCnpj("11.222.333/0001-81"), "11.222.333/0001-81");
    assert.equal(formatCpfCnpj("abc"), "");
  });
});

describe("hasCpfOrCnpjLength", () => {
  it("aceita só 11 (CPF) ou 14 (CNPJ) dígitos", () => {
    assert.equal(hasCpfOrCnpjLength("529.982.247-25"), true);
    assert.equal(hasCpfOrCnpjLength("11.222.333/0001-81"), true);
    assert.equal(hasCpfOrCnpjLength("5299822472"), false);
    assert.equal(hasCpfOrCnpjLength("529982247259"), false);
    assert.equal(hasCpfOrCnpjLength(""), false);
  });
});

describe("formatMoneyInput (máscara caixa registradora)", () => {
  it("os dígitos entram pela direita", () => {
    assert.equal(formatMoneyInput(""), "");
    assert.equal(formatMoneyInput("4"), "0,04");
    assert.equal(formatMoneyInput("45"), "0,45");
    assert.equal(formatMoneyInput("4590"), "45,90");
    assert.equal(formatMoneyInput("123456"), "1.234,56");
  });

  it("é estável quando o valor já formatado volta pelo onChange", () => {
    assert.equal(formatMoneyInput("45,90"), "45,90");
    assert.equal(formatMoneyInput("1.234,56"), "1.234,56");
    assert.equal(formatMoneyInput("0,00"), "0,00");
    assert.equal(formatMoneyInput("0"), "0,00");
  });

  it("limita ao teto do backend (R$ 1.000.000,00) e ignora letras", () => {
    assert.equal(formatMoneyInput("99999999999"), "1.000.000,00");
    assert.equal(formatMoneyInput("ab1c2"), "0,12");
  });
});

describe("moneyToCents", () => {
  it("converte os formatos que o usuário realmente digita", () => {
    assert.equal(moneyToCents("45"), 4500);
    assert.equal(moneyToCents("45,9"), 4590);
    assert.equal(moneyToCents("45,90"), 4590);
    assert.equal(moneyToCents("1.234,56"), 123456);
    assert.equal(moneyToCents("1234,56"), 123456);
    assert.equal(moneyToCents("45.90"), 4590);
    assert.equal(moneyToCents("0,00"), 0);
    assert.equal(moneyToCents(" 12,50 "), 1250);
  });

  // Regressão: `Number("1.234,56".replace(",", "."))` era NaN → `|| 0` → R$ 0,00 sem nenhum erro.
  it("nunca devolve 0 para um valor mal formado (devolve null)", () => {
    for (const bad of ["", "abc", "1,234,56", "-5", "1e3", "45,999", "1.234", "R$ 10", "12,3,4", null, undefined]) {
      assert.equal(moneyToCents(bad as string), null, String(bad));
    }
  });

  it("não sofre erro de ponto flutuante (1,15 → 115, 19,99 → 1999)", () => {
    assert.equal(moneyToCents("1,15"), 115);
    assert.equal(moneyToCents("19,99"), 1999);
    assert.equal(moneyToCents("0,29"), 29);
  });

  it("recusa acima do teto do backend", () => {
    assert.equal(moneyToCents("1.000.000,00"), 100_000_000);
    assert.equal(moneyToCents("1.000.000,01"), null);
  });
});

describe("parseIntStrict", () => {
  it("só aceita inteiro puro", () => {
    assert.equal(parseIntStrict("12"), 12);
    assert.equal(parseIntStrict(" 5 "), 5);
    for (const bad of ["", "1.5", "-1", "1e3", "abc", "12a", null]) assert.equal(parseIntStrict(bad as string), null);
  });
});

describe("normalizeInstagram", () => {
  it("aceita @, usuário, domínio e link completo, e devolve o link canônico", () => {
    for (const ok of ["@seusalao", "seusalao", "instagram.com/seusalao", "https://www.instagram.com/seusalao/", "http://instagram.com/seusalao?igsh=x"]) {
      assert.equal(normalizeInstagram(ok), "https://instagram.com/seusalao", ok);
    }
    assert.equal(normalizeInstagram("  "), "");
  });

  it("recusa outro domínio e usuário inválido (nunca repassa a URL do usuário)", () => {
    for (const bad of ["https://evil.com/x", "javascript:alert(1)", "@a b", "x".repeat(31), "https://instagram.com.evil.com/x"]) {
      assert.equal(normalizeInstagram(bad), null, bad);
    }
  });
});

describe("parseCoordinate", () => {
  it("aceita vírgula ou ponto e respeita a faixa", () => {
    assert.equal(parseCoordinate("-23,5505", "lat"), -23.5505);
    assert.equal(parseCoordinate("-46.6333", "lng"), -46.6333);
    assert.equal(parseCoordinate("91", "lat"), null);
    assert.equal(parseCoordinate("181", "lng"), null);
    assert.equal(parseCoordinate("abc", "lat"), null);
    assert.equal(parseCoordinate("", "lat"), null);
  });
});

describe("formatCep", () => {
  it("aplica a máscara e limita a 8 dígitos", () => {
    assert.equal(formatCep("01310100"), "01310-100");
    assert.equal(formatCep("01310"), "01310");
    assert.equal(formatCep("0131010099"), "01310-100");
    assert.equal(formatCep("abc"), "");
  });
});

import { isValidCnpj, normalizeCnpj } from "./cnpj.util";

describe("isValidCnpj", () => {
  it("aceita CNPJ válido com e sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e sequência repetida", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-8")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
    // CPF válido não passa como CNPJ.
    expect(isValidCnpj("529.982.247-25")).toBe(false);
  });

  it("normalizeCnpj devolve só dígitos", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
});

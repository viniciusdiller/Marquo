// CNPJ: 14 dígitos, dois dígitos verificadores (módulo 11) e sem sequência repetida. Valida forma e dígitos — não
// consulta a Receita. (O CNPJ alfanumérico de 2026 ainda não é aceito pelo provedor de cobrança.)
export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const check = (length: number) => {
    // Pesos 2..9 repetidos, da direita para a esquerda.
    let sum = 0;
    let weight = 2;
    for (let i = length - 1; i >= 0; i--) {
      sum += Number(cnpj[i]) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

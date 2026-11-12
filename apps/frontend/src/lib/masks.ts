// Máscaras de exibição (BR). Formatam o que o usuário vê e digita; o backend REVALIDA tudo
// (nada aqui é confiança — ver CLAUDE.md > Segurança > Confiança no cliente). Sem lib externa:
// são poucas regras, não justifica dependência.
//
// Convenção de valor: telefone e CPF trafegam como texto formatado ou dígitos (o backend normaliza
// para dígitos de qualquer forma); dinheiro trafega como texto BRL ("1.234,56") e as Server Actions
// convertem para centavos inteiros com `moneyToCents` (Int, mesma convenção do backend).

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

// Telefone nacional (DDD + número). Quem cola "+55 11 91234-5678" ou "5511912345678" não pode ter os
// dígitos cortados no meio: o DDI 55 é descartado antes de formatar.
export function nationalPhoneDigits(value: string): string {
  const d = onlyDigits(value);
  return (d.length > 11 && d.startsWith("55") ? d.slice(2) : d).slice(0, 11);
}

export function formatPhoneBR(value: string): string {
  const d = nationalPhoneDigits(value);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  // Celular (9 dígitos): (11) 91234-5678 · Fixo (8 dígitos): (11) 1234-5678
  const splitAt = d.length > 10 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, splitAt)}-${d.slice(splitAt)}`;
}

// Número do WhatsApp como o backend guarda: só dígitos, com DDI 55 (vira link wa.me).
// Devolve "" quando o número não é um telefone brasileiro plausível — quem chama decide o erro.
export function whatsappDigits(value: string): string {
  const d = nationalPhoneDigits(value);
  const plausible = /^[1-9][1-9]\d{8,9}$/.test(d) && (d.length === 10 || d[2] === "9");
  return plausible ? `55${d}` : "";
}

export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean);
  const dv = d.slice(9, 11);
  return parts.join(".") + (dv ? `-${dv}` : "");
}

// CPF (até 11 dígitos) ou CNPJ (12 a 14): a máscara troca sozinha conforme o tamanho. "52998224725" → "529.982.247-25",
// "11222333000181" → "11.222.333/0001-81". Só exibição: o backend confere os dígitos verificadores.
export function formatCpfCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) return formatCPF(d);
  const base = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8)].join(".");
  const branch = d.slice(8, 12);
  const dv = d.slice(12, 14);
  return `${base}/${branch}${dv ? `-${dv}` : ""}`;
}

// Só o tamanho (11 = CPF, 14 = CNPJ), para avisar antes de enviar. Quem decide se o documento é válido é o backend.
export function hasCpfOrCnpjLength(value: string): boolean {
  const length = onlyDigits(value).length;
  return length === 11 || length === 14;
}

// Teto do backend: 100_000_000 centavos (R$ 1.000.000,00). Digitar além disso não faz sentido e
// o backend recusaria de qualquer jeito; 9 dígitos de centavos = R$ 9.999.999,99 → limitamos a 100_000_000.
const MAX_CENTS = 100_000_000;

// Máscara "caixa registradora": cada dígito digitado entra pela direita, como nos apps de banco.
// "4" → "0,04" · "45" → "0,45" · "4590" → "45,90" · "123456" → "1.234,56".
export function formatMoneyInput(value: string): string {
  const all = onlyDigits(value);
  if (!all) return "";
  const digits = all.replace(/^0+/, "");
  const cents = digits ? Math.min(Number(digits.slice(0, 12)), MAX_CENTS) : 0;
  return formatCentsBRL(cents);
}

// Centavos inteiros → "1.234,56" (sem símbolo: o "R$" fica no rótulo do campo).
export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Texto BRL → centavos inteiros, ou null se não for um valor monetário bem formado. Estrito de
// propósito: o parse antigo (`Number("1.234,56".replace(",", "."))` → NaN → 0) transformava um valor
// digitado com milhar em R$ 0,00 SEM erro — num caixa, isso abria o dia com fundo zero.
//   aceita: "45" · "45,9" · "45,90" · "1.234,56" · "1234,56" · "45.90" (ponto decimal, 1–2 casas)
//   recusa: "" · "abc" · "1,234,56" · "-5" · "1e3" · "45,999"
export function moneyToCents(value: string | null | undefined): number | null {
  const text = (value ?? "").trim();
  let reais: string;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) reais = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(text)) reais = text.replace(",", ".");
  else if (/^\d+(\.\d{1,2})?$/.test(text)) reais = text;
  else return null;
  const [int, dec = ""] = reais.split(".");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

// Inteiro positivo digitado num campo de texto/number ("12", " 12 "); null se não for inteiro puro.
export function parseIntStrict(value: string | null | undefined): number | null {
  const text = (value ?? "").trim();
  return /^\d{1,9}$/.test(text) ? Number(text) : null;
}

// Instagram: aceita "@salao", "salao", "instagram.com/salao" e o link completo, e devolve o link
// canônico https://instagram.com/salao (o único formato que o backend aceita). "" = campo vazio;
// null = não deu para entender (o usuário precisa corrigir).
export function normalizeInstagram(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  // Com "://" ou "/" é um endereço: tem que ser mesmo o do Instagram (nada de repassar outro domínio).
  if (/^https?:\/\//i.test(text) || text.includes("/")) {
    const m = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(text);
    return m ? `https://instagram.com/${m[1]}` : null;
  }
  const handle = text.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://instagram.com/${handle}` : null;
}

// Coordenada digitada em pt-BR ("-23,5505") ou en ("-23.5505") → número, ou null se inválida/fora da faixa.
export function parseCoordinate(value: string, kind: "lat" | "lng"): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^-?\d{1,3}(\.\d{1,8})?$/.test(text)) return null;
  const n = Number(text);
  const limit = kind === "lat" ? 90 : 180;
  return Math.abs(n) <= limit ? n : null;
}

// Consulta de CEP (ViaCEP). Sem React nem next/*: testável com node --test.
// Roda no SERVIDOR do Next (Server Action), com host fixo: o CEP só entra na URL depois de conferido como 8 dígitos, então
// nada vindo do usuário muda o destino da chamada. O resultado é só conforto de preenchimento: o backend revalida os dados.

export interface CepAddress {
  address: string;
  province: string;
  city: string;
  state: string;
}

export type CepLookup = { ok: true; found: true; data: CepAddress } | { ok: true; found: false } | { ok: false };

const VIACEP = "https://viacep.com.br/ws";
const TIMEOUT_MS = 5000;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function parseCepResponse(body: unknown): CepAddress | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  // O ViaCEP devolve { "erro": true } (às vezes "true") para CEP que não existe.
  if (record.erro !== undefined && record.erro !== false && record.erro !== "false") return null;
  const data = {
    address: text(record.logradouro, 120),
    province: text(record.bairro, 80),
    city: text(record.localidade, 80),
    state: text(record.uf, 2),
  };
  // CEP "geral" de cidade pequena vem sem rua e bairro, mas ainda é válido: o dono completa à mão.
  return data.city || data.address || data.province ? data : null;
}

export async function lookupCep(rawCep: string, fetchImpl: typeof fetch = fetch): Promise<CepLookup> {
  const digits = rawCep.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) return { ok: true, found: false };
  try {
    const response = await fetchImpl(`${VIACEP}/${digits}/json/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    // 400 = CEP malformado para o provedor: tratado como "não encontrado". Outros erros: serviço fora do ar.
    if (response.status === 400) return { ok: true, found: false };
    if (!response.ok) return { ok: false };
    const data = parseCepResponse(await response.json());
    return data ? { ok: true, found: true, data } : { ok: true, found: false };
  } catch {
    return { ok: false };
  }
}

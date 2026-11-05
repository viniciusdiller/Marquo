// Origens que o navegador pode chamar esta API: o app (FRONTEND_URL) e, opcionalmente, o site institucional
// (SITE_URL), que só lê GET /plans (preços). Só a ORIGEM conta (protocolo + host + porta): "https://x.com/" e
// "https://x.com/pagina" viram "https://x.com", que é o que o navegador manda no cabeçalho Origin.
// Nunca "*" nem reflexo do Origin recebido: só o que está configurado.
// Só em DESENVOLVIMENTO: libera o site aberto pelo celular (IP da rede local, ex.: http://192.168.3.71:3000). Apenas as
// faixas privadas (192.168.x.x, 10.x.x.x, 172.16–31.x.x) em http, nunca um host público; em produção devolve vazio.
const PRIVATE_NETWORK_ORIGIN =
  /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}$/;

export function devLanOrigins(env: { NODE_ENV?: string }): RegExp[] {
  return env.NODE_ENV === "production" ? [] : [PRIVATE_NETWORK_ORIGIN];
}

export function corsOrigins(env: { FRONTEND_URL?: string; SITE_URL?: string }): string[] {
  const origins = new Set<string>();
  for (const value of [env.FRONTEND_URL ?? "http://localhost:3000", env.SITE_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // valor inválido: já barrado por env.validation; aqui só ignora em vez de abrir a porta
    }
  }
  return [...origins];
}

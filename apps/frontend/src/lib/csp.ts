// Content-Security-Policy com NONCE por requisição (proxy.ts). O nonce é o que permite bloquear
// `<script>` injetado: só executa script que traga o nonce desta resposta, e o Next o aplica sozinho aos
// scripts dele (ver node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). `strict-dynamic`
// deixa esses scripts carregarem os chunks seguintes sem listar cada URL.
//
// Escolhas que NÃO são óbvias:
// - `style-src 'unsafe-inline'`: o React usa `style={{...}}` (atributo) em vários lugares, inclusive a cor de
//   destaque do salão (`--tenant-accent`). Nonce não vale para atributo `style`, então exigir nonce quebraria
//   o layout. O risco que o CSP fecha aqui é o de SCRIPT (XSS); injeção de CSS tem impacto bem menor.
// - `connect-src`/`img-src` incluem a origem da API: o navegador chama /public/* direto (cadastro, wizard de
//   agendamento) e carrega logo/galeria de /uploads dela.
// - `frame-src` só do Google Maps: a seção de contato do salão embute o mapa do endereço.
// - `upgrade-insecure-requests` só em produção COM API https (em http local, forçar https quebraria as chamadas).

export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, isDev, apiUrl }: { nonce: string; isDev: boolean; apiUrl: string }): string {
  const api = originOf(apiUrl);
  const apiSources = api ? [api] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Em dev o React usa eval para remontar stack traces no navegador; em produção não é necessário.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "blob:",
      "data:",
      ...apiSources,
      "https://picsum.photos",
      "https://*.basemaps.cartocdn.com",
      "https://*.tile.openstreetmap.org",
      "https://tile.openstreetmap.org",
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...apiSources, ...(isDev ? ["ws:", "wss:"] : [])],
    "frame-src": ["https://www.google.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev && (api === null || api.startsWith("https:"))) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

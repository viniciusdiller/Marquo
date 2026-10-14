// Slugs que um tenant NÃO pode ocupar: /[slug] compartilha o namespace de URL com as rotas do
// próprio app (frontend) e com prefixos da API. Sem isso, com cadastro público, alguém
// registraria "Dashboard" ou "Entrar" e a página pública do tenant ficaria inalcançável (a rota
// estática do app vence), ou reservaria nomes de marca como "marquo" (e o antigo "totalagenda"). Slug colidente não é
// recusado: o gerador acrescenta sufixo (dashboard-2).
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // rotas do frontend (apps/frontend/src/app)
  "api",
  "dashboard",
  "definir-senha",
  "descobrir",
  "entrar",
  "cadastro",
  "termos",
  "privacidade",
  "minha-conta",
  "sitemap",
  "robots",
  "icon",
  "_next",
  // prefixos da API e estáticos
  "public",
  "auth",
  "billing",
  "webhooks",
  "internal",
  "uploads",
  "static",
  // marca e páginas institucionais previsíveis
  "admin",
  "app",
  "www",
  "login",
  "suporte",
  "ajuda",
  "planos",
  "precos",
  "blog",
  "marquo",
  "totalagenda",
  "totalsoftware",
  "total-agenda",
  "total-software",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

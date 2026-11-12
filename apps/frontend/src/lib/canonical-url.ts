/**
 * Consolidação de domínio canônico: redireciona requisições de subdomínio `www.`
 * para o domínio apex com status HTTP 301 (Moved Permanently).
 * Evita canibalização de tráfego, divisão de crawl budget e classificação
 * de páginas alternativas no Google Search Console.
 */
export function getCanonicalRedirect(
  pathnameWithSearch: string,
  host: string | null | undefined,
): string | null {
  if (!host) return null;

  const normalizedHost = host.toLowerCase().trim();
  if (normalizedHost.startsWith("www.")) {
    const canonicalHost = normalizedHost.slice(4);
    const path = pathnameWithSearch.startsWith("/") ? pathnameWithSearch : `/${pathnameWithSearch}`;
    return `https://${canonicalHost}${path}`;
  }

  return null;
}


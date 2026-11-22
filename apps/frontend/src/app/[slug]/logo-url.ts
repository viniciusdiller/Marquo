const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// A logo é servida pela API (/uploads/...). Prévias do Google/WhatsApp e o JSON-LD precisam do endereço COMPLETO;
// relativo, ela seria procurada no domínio do site, onde não existe.
export function absoluteLogoUrl(logoUrl: string | null, updatedAt?: string, apiUrl: string = API_URL): string | undefined {
  if (!logoUrl) return undefined;
  const url = logoUrl.startsWith("/") ? `${apiUrl.replace(/\/+$/, "")}${logoUrl}` : logoUrl;
  return updatedAt ? `${url}?v=${encodeURIComponent(updatedAt)}` : url;
}

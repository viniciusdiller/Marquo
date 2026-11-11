// Texto e rótulos da lista de espera (puro, sem React: testável com node --test).

export const WAITLIST_TABS = [
  { value: "aguardando", label: "Aguardando", status: "PENDING" },
  { value: "contatados", label: "Contatados", status: "CONTACTED" },
  { value: "encerrados", label: "Encerrados", status: "CLOSED" },
] as const;

export type WaitlistTabValue = (typeof WAITLIST_TABS)[number]["value"];

export function parseWaitlistTab(value: string | string[] | undefined): (typeof WAITLIST_TABS)[number] {
  return WAITLIST_TABS.find((t) => t.value === value) ?? WAITLIST_TABS[0];
}

export const WAITLIST_STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando",
  CONTACTED: "Contatado",
  RESOLVED: "Resolvido",
  CANCELED: "Cancelado",
};

// "2026-11-14" → "14/11" (sem criar Date: evita deslocar o dia por fuso).
export function formatPreferredDate(iso: string | null): string | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return match ? `${match[3]}/${match[2]}` : null;
}

// Mensagem pronta para o WhatsApp: o dono revisa e envia pelo próprio aplicativo.
export function waitlistMessage(input: {
  clientName: string;
  serviceName: string;
  tenantName?: string | null;
  preferredDate: string | null;
}): string {
  const first = input.clientName.trim().split(/\s+/)[0] || "";
  const day = formatPreferredDate(input.preferredDate);
  const where = input.tenantName ? ` no ${input.tenantName}` : "";
  return `Olá${first ? `, ${first}` : ""}! Abriu um horário${where} para ${input.serviceName}${day ? ` (você pediu o dia ${day})` : ""}. Ainda tem interesse?`;
}

// Abas da lista de comandas. Sem React nem next/*: testável sem renderizar nada.
export const TICKET_TABS = [
  { key: "abertas", label: "Abertas", status: "OPEN" },
  { key: "fechadas", label: "Fechadas", status: "CLOSED" },
  { key: "canceladas", label: "Canceladas", status: "CANCELED" },
] as const;

export type TicketTabKey = (typeof TICKET_TABS)[number]["key"];

// `?aba=` vem da URL: só os valores conhecidos valem; qualquer outra coisa cai em "abertas" (nunca vai para a chamada ao backend).
export function parseTicketTab(value: string | string[] | undefined): (typeof TICKET_TABS)[number] {
  const raw = Array.isArray(value) ? value[0] : value;
  return TICKET_TABS.find((tab) => tab.key === raw) ?? TICKET_TABS[0];
}

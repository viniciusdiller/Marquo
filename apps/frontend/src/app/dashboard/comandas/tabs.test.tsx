import { describe, expect, it } from "vitest";
import { TICKET_TABS, parseTicketTab } from "./tabs";

describe("parseTicketTab", () => {
  it("aceita as três abas", () => {
    expect(parseTicketTab("abertas").status).toBe("OPEN");
    expect(parseTicketTab("fechadas").status).toBe("CLOSED");
    expect(parseTicketTab("canceladas").status).toBe("CANCELED");
  });

  it("sem valor, valor desconhecido ou lixo cai em 'abertas' (nunca chega ao backend)", () => {
    for (const value of [undefined, "", "todas", "CLOSED", "../x", "fechadas;drop"]) {
      expect(parseTicketTab(value).key).toBe("abertas");
    }
  });

  it("com a URL repetida (?aba=a&aba=b) vale a primeira", () => {
    expect(parseTicketTab(["fechadas", "canceladas"]).key).toBe("fechadas");
    expect(parseTicketTab([]).key).toBe("abertas");
  });

  it("a primeira aba é a das abertas (o padrão de sempre)", () => {
    expect(TICKET_TABS[0].key).toBe("abertas");
  });
});

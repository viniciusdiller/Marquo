import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatPreferredDate, parseWaitlistTab, waitlistMessage } from "./waitlist.ts";

describe("parseWaitlistTab", () => {
  it("aba desconhecida ou ausente cai em Aguardando", () => {
    assert.equal(parseWaitlistTab(undefined).status, "PENDING");
    assert.equal(parseWaitlistTab("lixo").status, "PENDING");
    assert.equal(parseWaitlistTab(["encerrados"]).status, "PENDING");
  });
  it("abas válidas", () => {
    assert.equal(parseWaitlistTab("contatados").status, "CONTACTED");
    assert.equal(parseWaitlistTab("encerrados").status, "CLOSED");
  });
});

describe("formatPreferredDate", () => {
  it("formata dia/mês sem deslocar por fuso", () => {
    assert.equal(formatPreferredDate("2026-11-14"), "14/11");
    assert.equal(formatPreferredDate("2026-11-14T00:00:00.000Z"), "14/11");
  });
  it("sem data ou inválida devolve null", () => {
    assert.equal(formatPreferredDate(null), null);
    assert.equal(formatPreferredDate("amanhã"), null);
  });
});

describe("waitlistMessage", () => {
  it("usa o primeiro nome, o serviço, o negócio e o dia pedido", () => {
    assert.equal(
      waitlistMessage({ clientName: "Carla Souza", serviceName: "Corte", tenantName: "Salão Demo", preferredDate: "2026-11-14" }),
      "Olá, Carla! Abriu um horário no Salão Demo para Corte (você pediu o dia 14/11). Ainda tem interesse?",
    );
  });
  it("sem dia e sem negócio fica curta", () => {
    assert.equal(
      waitlistMessage({ clientName: "  ", serviceName: "Barba", preferredDate: null }),
      "Olá! Abriu um horário para Barba. Ainda tem interesse?",
    );
  });
});

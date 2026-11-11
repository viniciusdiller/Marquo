import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBRDate, formatTime, joinDateTime, minuteOptions, parseISODate, parseTime, splitDateTime, toISODate } from "./date-input.ts";

describe("parseISODate / toISODate", () => {
  it("ida e volta sem deslocar o dia", () => {
    assert.equal(toISODate(parseISODate("2026-11-09")!), "2026-11-09");
  });
  it("recusa data impossível e texto solto", () => {
    assert.equal(parseISODate("2026-02-31"), undefined);
    assert.equal(parseISODate("09/11/2026"), undefined);
    assert.equal(parseISODate(""), undefined);
    assert.equal(parseISODate(undefined), undefined);
  });
  it("formata dd/MM/aaaa", () => {
    assert.equal(formatBRDate("2026-11-09"), "09/11/2026");
    assert.equal(formatBRDate("lixo"), "");
  });
});

describe("parseTime / formatTime", () => {
  it("aceita HH:mm válido", () => {
    assert.deepEqual(parseTime("09:30"), { hour: 9, minute: 30 });
    assert.equal(formatTime(9, 5), "09:05");
  });
  it("recusa hora ou minuto fora da faixa", () => {
    assert.equal(parseTime("24:00"), undefined);
    assert.equal(parseTime("12:60"), undefined);
    assert.equal(parseTime("9:30"), undefined);
  });
});

describe("minuteOptions", () => {
  it("de 5 em 5 por padrão e inclui o minuto salvo fora do passo", () => {
    assert.equal(minuteOptions(5).length, 12);
    assert.ok(minuteOptions(5, 7).includes(7));
    assert.deepEqual(minuteOptions(30), [0, 30]);
  });
  it("passo inválido cai no padrão", () => {
    assert.equal(minuteOptions(0).length, 12);
    assert.equal(minuteOptions(99).length, 12);
  });
});

describe("splitDateTime / joinDateTime", () => {
  it("separa e junta o formato do datetime-local", () => {
    assert.deepEqual(splitDateTime("2026-11-09T14:30"), { date: "2026-11-09", time: "14:30" });
    assert.equal(joinDateTime("2026-11-09", "14:30"), "2026-11-09T14:30");
  });
  it("faltando uma das partes, o valor junto fica vazio", () => {
    assert.equal(joinDateTime("2026-11-09", ""), "");
    assert.deepEqual(splitDateTime(""), { date: "", time: "" });
  });
});

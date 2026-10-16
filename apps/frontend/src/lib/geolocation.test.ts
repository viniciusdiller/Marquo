import test from "node:test";
import assert from "node:assert/strict";
import { geolocationErrorMessage, roundCoords } from "./geolocation.ts";

test("roundCoords arredonda para ~1 km antes de sair do navegador", () => {
  assert.deepEqual(roundCoords(-23.550520, -46.633308), { lat: -23.55, lng: -46.63 });
  assert.deepEqual(roundCoords(-22.9068467, -43.1728965), { lat: -22.91, lng: -43.17 });
});

test("mensagens de erro de geolocalização saem em português e por código", () => {
  assert.match(geolocationErrorMessage(1), /permissão foi negada/);
  assert.match(geolocationErrorMessage(2), /Não conseguimos/);
  assert.match(geolocationErrorMessage(3), /Demorou demais/);
  assert.match(geolocationErrorMessage(null), /navegador não permite/);
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canAccess, fallbackAccess, firstAllowedHref } from "./access.ts";
import { normalizePermissions } from "@marquo/shared-types";

const none = normalizePermissions({});
const me = (permissions: Record<string, string>, isOwner = false) => ({ isOwner, permissions: normalizePermissions(permissions) });

describe("canAccess", () => {
  it("dono vê e edita tudo", () => {
    assert.equal(canAccess({ isOwner: true, permissions: none }, "caixa", "EDIT"), true);
  });
  it("sem acesso nega ver e editar", () => {
    assert.equal(canAccess(me({}), "caixa"), false);
    assert.equal(canAccess(me({}), "caixa", "EDIT"), false);
  });
  it("só ver libera ver mas não editar", () => {
    assert.equal(canAccess(me({ caixa: "VIEW" }), "caixa"), true);
    assert.equal(canAccess(me({ caixa: "VIEW" }), "caixa", "EDIT"), false);
  });
  it("ver e editar libera os dois", () => {
    assert.equal(canAccess(me({ caixa: "EDIT" }), "caixa", "EDIT"), true);
  });
});

describe("fallbackAccess / firstAllowedHref", () => {
  it("recepção padrão cai na agenda; profissional também", () => {
    assert.equal(firstAllowedHref(fallbackAccess("RECEPTIONIST")), "/dashboard/agenda");
    assert.equal(fallbackAccess("PROFESSIONAL").isOwner, false);
  });
  it("caixa (só comandas e caixa) cai na primeira tela liberada, não na agenda", () => {
    assert.equal(firstAllowedHref(me({ caixa: "EDIT", comandas: "VIEW" })), "/dashboard/comandas");
  });
  it("sem nenhuma área devolve null (a tela mostra aviso, sem loop de redirect)", () => {
    assert.equal(firstAllowedHref(me({})), null);
  });
  it("dono sempre tem para onde ir", () => {
    assert.equal(firstAllowedHref(fallbackAccess("OWNER")), "/dashboard/agenda");
  });
});

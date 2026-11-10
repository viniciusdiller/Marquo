import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_COOKIE, isPlanTier, parsePlanCookie, parsePlanParam, planCookieValue, teamLabel } from "./signup-plan.ts";

describe("parsePlanParam", () => {
  it("aceita o NOME que o site institucional manda e o tier, sem caixa nem acento", () => {
    assert.equal(parsePlanParam("Essencial"), "ESSENCIAL");
    assert.equal(parsePlanParam("Profissional"), "PROFISSIONAL");
    assert.equal(parsePlanParam("premium"), "PREMIUM");
    assert.equal(parsePlanParam("PROFISSIONAL"), "PROFISSIONAL");
    assert.equal(parsePlanParam("  Essencial "), "ESSENCIAL");
  });

  // O parâmetro vem da URL: qualquer coisa pode chegar.
  it("ignora lixo, vazio, lista e valor gigante", () => {
    for (const bad of ["", "gratis", "admin", "ESSENCIAL; DROP", "<script>", "x".repeat(500), undefined, null]) {
      assert.equal(parsePlanParam(bad as string), null, String(bad));
    }
    assert.equal(parsePlanParam(["Premium", "Essencial"]), "PREMIUM");
    assert.equal(parsePlanParam([]), null);
  });
});

describe("parsePlanCookie / isPlanTier", () => {
  it("só devolve um dos três tiers exatos", () => {
    assert.equal(parsePlanCookie("PREMIUM"), "PREMIUM");
    for (const bad of ["premium", "OUTRO", "", undefined, null, "PREMIUM "]) {
      assert.equal(parsePlanCookie(bad as string), null, String(bad));
    }
    assert.equal(isPlanTier("ESSENCIAL"), true);
    assert.equal(isPlanTier(42), false);
  });

  it("o cookie gravado é lido de volta (mesmo nome, sem HttpOnly de propósito: é só preferência de tela)", () => {
    const value = planCookieValue("PROFISSIONAL");
    assert.ok(value.startsWith(`${PLAN_COOKIE}=PROFISSIONAL;`));
    assert.match(value, /path=\//);
    assert.match(value, /samesite=lax/);
    assert.equal(parsePlanCookie(value.split(";")[0].split("=")[1]), "PROFISSIONAL");
  });
});

describe("teamLabel", () => {
  it("descreve a equipe conforme o limite do backend", () => {
    assert.equal(teamLabel(2), "Até 2 profissionais");
    assert.equal(teamLabel(5), "Até 5 profissionais");
    assert.equal(teamLabel(null), "Profissionais ilimitados");
    assert.equal(teamLabel(1), "1 profissional");
  });
});

describe("planFeatures", () => {
  it("todos os planos têm a lista básica, disponível já no teste", async () => {
    const { planFeatures, INCLUDED_IN_ALL_PLANS } = await import("./signup-plan.ts");
    assert.deepEqual(
      planFeatures(false),
      INCLUDED_IN_ALL_PLANS.map((label) => ({ label, afterTrialOnly: false })),
    );
  });

  it("o clube só aparece quando o catálogo diz que o plano inclui, e SEMPRE marcado como fora do teste", async () => {
    const { planFeatures, CLUB_FEATURE_LABEL } = await import("./signup-plan.ts");
    const features = planFeatures(true);
    const club = features.find((f) => f.label === CLUB_FEATURE_LABEL);
    assert.ok(club);
    assert.equal(club.afterTrialOnly, true);
    assert.equal(features.filter((f) => f.afterTrialOnly).length, 1);
  });

  it("o aviso fala dos 14 dias grátis e de assinar o Profissional ou o Premium", async () => {
    const { CLUB_NOT_IN_TRIAL_NOTICE } = await import("./signup-plan.ts");
    assert.match(CLUB_NOT_IN_TRIAL_NOTICE, /14 dias grátis/);
    assert.match(CLUB_NOT_IN_TRIAL_NOTICE, /assina o Profissional ou o Premium/);
  });
});

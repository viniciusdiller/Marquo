import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
vi.mock("@/lib/api-server", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { ApiError } from "@/lib/api";
import {
  cancelClubMemberAction,
  createClubPlanAction,
  enrollClubMemberAction,
  renewClubMemberAction,
  setClubEnabledAction,
  setClubPlanActiveAction,
} from "./actions";

function form(entries: Array<[string, string]>) {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

const valid: Array<[string, string]> = [["name", "Clube do Corte"], ["price", "120,00"], ["usesPerMonth", "4"], ["serviceIds", "s1"], ["serviceIds", "s2"]];

beforeEach(() => {
  authedFetch.mockReset();
  authedFetch.mockResolvedValue({});
});

describe("createClubPlanAction", () => {
  it("converte o valor BRL para centavos e envia os serviços marcados", async () => {
    const res = await createClubPlanAction(undefined, form(valid));
    expect(res.ok).toBe(true);
    const [path, init] = authedFetch.mock.calls[0];
    expect(path).toBe("/club/plans");
    expect(JSON.parse(init.body)).toEqual({ name: "Clube do Corte", priceCents: 12000, usesPerMonth: 4, serviceIds: ["s1", "s2"] });
  });

  // Dinheiro mal formado nunca vira 0 em silêncio (regra do projeto): erro ao usuário e nada é enviado.
  it("valor inválido ou abaixo de R$ 1,00: erro e nenhuma chamada", async () => {
    for (const price of ["abc", "", "0,50", "0"]) {
      const res = await createClubPlanAction(undefined, form(valid.map(([k, v]) => (k === "price" ? [k, price] : [k, v])) as Array<[string, string]>));
      expect(res.error).toMatch(/valor mensal/i);
    }
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("usos fora de 1 a 60 (ou não inteiros): erro e nenhuma chamada", async () => {
    for (const uses of ["0", "61", "2,5", "x", ""]) {
      const res = await createClubPlanAction(undefined, form(valid.map(([k, v]) => (k === "usesPerMonth" ? [k, uses] : [k, v])) as Array<[string, string]>));
      expect(res.error).toMatch(/usos por mês/i);
    }
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("sem serviço marcado: erro e nenhuma chamada", async () => {
    const res = await createClubPlanAction(undefined, form(valid.filter(([k]) => k !== "serviceIds")));
    expect(res.error).toMatch(/serviço/i);
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("devolve a mensagem do backend (ex.: plano sem clube)", async () => {
    authedFetch.mockRejectedValue(new ApiError("O clube de assinaturas está disponível nos planos Profissional e Premium.", 403));
    const res = await createClubPlanAction(undefined, form(valid));
    expect(res.error).toMatch(/Profissional e Premium/);
  });

  it("erro inesperado vira mensagem genérica (nunca o texto cru)", async () => {
    authedFetch.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));
    const res = await createClubPlanAction(undefined, form(valid));
    expect(res.error).toBe("Não foi possível criar o pacote.");
  });
});

describe("demais ações do clube", () => {
  it("liga e desliga o clube", async () => {
    await setClubEnabledAction(true);
    expect(authedFetch).toHaveBeenCalledWith("/club", { method: "PATCH", body: JSON.stringify({ enabled: true }) });
    await setClubEnabledAction(false);
    expect(JSON.parse(authedFetch.mock.calls[1][1].body)).toEqual({ enabled: false });
  });

  it("ativa e desativa pacote pelo id (codificado na URL)", async () => {
    await setClubPlanActiveAction("p 1", false);
    expect(authedFetch.mock.calls[0][0]).toBe("/club/plans/p%201");
    expect(JSON.parse(authedFetch.mock.calls[0][1].body)).toEqual({ isActive: false });
  });

  it("inscreve só com clientId e planId (nenhum valor de dinheiro viaja)", async () => {
    await enrollClubMemberAction("c1", "p1");
    expect(authedFetch.mock.calls[0][0]).toBe("/club/members");
    expect(JSON.parse(authedFetch.mock.calls[0][1].body)).toEqual({ clientId: "c1", planId: "p1" });
  });

  it("renova e cancela sem corpo (o servidor decide valor e datas)", async () => {
    await renewClubMemberAction("m1");
    expect(authedFetch).toHaveBeenLastCalledWith("/club/members/m1/renew", { method: "POST" });
    await cancelClubMemberAction("m1");
    expect(authedFetch).toHaveBeenLastCalledWith("/club/members/m1/cancel", { method: "POST" });
  });

  it("todas devolvem o erro do backend sem lançar", async () => {
    authedFetch.mockRejectedValue(new ApiError("Este mês ainda está em andamento.", 409));
    expect((await renewClubMemberAction("m1")).error).toBe("Este mês ainda está em andamento.");
    expect((await enrollClubMemberAction("c", "p")).error).toBe("Este mês ainda está em andamento.");
    expect((await cancelClubMemberAction("m")).error).toBe("Este mês ainda está em andamento.");
    expect((await setClubEnabledAction(true)).error).toBe("Este mês ainda está em andamento.");
    expect((await setClubPlanActiveAction("p", true)).error).toBe("Este mês ainda está em andamento.");
  });
});

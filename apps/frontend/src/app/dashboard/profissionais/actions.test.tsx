import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
vi.mock("@/lib/api-server", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createProfessionalAction } from "./actions";

function form(entries: Array<[string, string]>) {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

describe("createProfessionalAction", () => {
  beforeEach(() => {
    authedFetch.mockReset();
    authedFetch.mockResolvedValue({});
  });

  it("envia os serviços marcados junto com o cadastro", async () => {
    await createProfessionalAction(undefined, form([["name", "Alex"], ["email", "a@x.com"], ["initialPassword", "senha-forte-1"], ["serviceIds", "s1"], ["serviceIds", "s2"]]));

    const [path, init] = authedFetch.mock.calls[0];
    expect(path).toBe("/professionals");
    expect(JSON.parse(init.body)).toEqual({ name: "Alex", email: "a@x.com", initialPassword: "senha-forte-1", serviceIds: ["s1", "s2"] });
  });

  it("sem nenhum serviço marcado envia lista vazia (não omite nem quebra)", async () => {
    await createProfessionalAction(undefined, form([["name", "Alex"], ["email", "a@x.com"], ["initialPassword", "senha-forte-1"]]));
    expect(JSON.parse(authedFetch.mock.calls[0][1].body).serviceIds).toEqual([]);
  });

  it("devolve o erro quando o backend recusa", async () => {
    const { ApiError } = await import("@/lib/api");
    authedFetch.mockRejectedValue(new ApiError("Serviço não encontrado.", 404));
    const res = await createProfessionalAction(undefined, form([["name", "Alex"], ["email", "a@x.com"], ["initialPassword", "senha-forte-1"], ["serviceIds", "s9"]]));
    expect(res.error).toBe("Serviço não encontrado.");
  });

  // Segurança: "eu também atendo" não manda nome, e-mail nem senha; o backend usa a conta do token.
  it("'Eu também atendo' chama /professionals/self só com os serviços (nenhum campo de identidade)", async () => {
    await createProfessionalAction(
      undefined,
      form([["self", "on"], ["name", "Outro Nome"], ["email", "outro@x.com"], ["initialPassword", "senha-forte-1"], ["serviceIds", "s1"]]),
    );

    expect(authedFetch).toHaveBeenCalledTimes(1);
    const [path, init] = authedFetch.mock.calls[0];
    expect(path).toBe("/professionals/self");
    expect(JSON.parse(init.body)).toEqual({ serviceIds: ["s1"] });
  });

  it("'Eu também atendo' devolve o erro do backend (ex.: já cadastrado)", async () => {
    const { ApiError } = await import("@/lib/api");
    authedFetch.mockRejectedValue(new ApiError("Você já está cadastrado como profissional.", 409));
    const res = await createProfessionalAction(undefined, form([["self", "on"]]));
    expect(res.error).toBe("Você já está cadastrado como profissional.");
  });
});

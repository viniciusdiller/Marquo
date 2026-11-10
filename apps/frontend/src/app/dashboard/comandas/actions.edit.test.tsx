import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
vi.mock("@/lib/api-server", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { closeTicketAction, removeTicketPaymentAction, reopenTicketAction, setTicketNoteAction, updateTicketItemAction } from "./actions";

const TICKET = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const PAY = "33333333-3333-4333-8333-333333333333";
const PRO = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  authedFetch.mockReset();
  authedFetch.mockResolvedValue({ id: TICKET, status: "OPEN" });
});

describe("updateTicketItemAction", () => {
  it("PATCH no item com só o que mudou", async () => {
    const res = await updateTicketItemAction(TICKET, ITEM, { quantity: 3, professionalId: PRO });
    expect(res.ok).toBe(true);
    const [path, init] = authedFetch.mock.calls[0];
    expect(path).toBe(`/tickets/${TICKET}/items/${ITEM}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ quantity: 3, professionalId: PRO });
  });

  it("null limpa o profissional", async () => {
    await updateTicketItemAction(TICKET, ITEM, { professionalId: null });
    expect(JSON.parse(authedFetch.mock.calls[0][1].body)).toEqual({ professionalId: null });
  });

  // Argumento de Server Action é controlado pelo cliente: id fora do formato nunca vira caminho de chamada ao backend.
  it("ids que não são UUID são recusados SEM chamar o backend (nada de ../ no caminho)", async () => {
    for (const bad of ["../x", "abc", "1/2", ""]) {
      expect((await updateTicketItemAction(bad, ITEM, { quantity: 2 })).ok).toBe(false);
      expect((await updateTicketItemAction(TICKET, bad, { quantity: 2 })).ok).toBe(false);
    }
    expect((await updateTicketItemAction(TICKET, ITEM, { professionalId: "../x" })).ok).toBe(false);
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it("devolve o erro do backend", async () => {
    authedFetch.mockRejectedValue(new ApiError("Comanda não está aberta.", 409));
    expect(await updateTicketItemAction(TICKET, ITEM, { quantity: 2 })).toEqual({ ok: false, error: "Comanda não está aberta." });
  });
});

describe("setTicketNoteAction", () => {
  it("envia o texto ou null", async () => {
    await setTicketNoteAction(TICKET, "obs");
    expect(authedFetch.mock.calls[0][0]).toBe(`/tickets/${TICKET}/note`);
    expect(JSON.parse(authedFetch.mock.calls[0][1].body)).toEqual({ note: "obs" });
    await setTicketNoteAction(TICKET, null);
    expect(JSON.parse(authedFetch.mock.calls[1][1].body)).toEqual({ note: null });
  });

  it("id inválido não chama o backend", async () => {
    expect((await setTicketNoteAction("x/../y", "obs")).ok).toBe(false);
    expect(authedFetch).not.toHaveBeenCalled();
  });
});

describe("removeTicketPaymentAction", () => {
  it("POST em /remove com o motivo", async () => {
    await removeTicketPaymentAction(TICKET, PAY, "valor errado");
    const [path, init] = authedFetch.mock.calls[0];
    expect(path).toBe(`/tickets/${TICKET}/payments/${PAY}/remove`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "valor errado" });
  });

  it("ids inválidos não chamam o backend; erro do backend (caixa fechado) volta ao usuário", async () => {
    expect((await removeTicketPaymentAction(TICKET, "../pay", "motivo")).ok).toBe(false);
    expect(authedFetch).not.toHaveBeenCalled();
    authedFetch.mockRejectedValue(new ApiError("Este pagamento entrou num caixa que já foi fechado.", 409));
    expect((await removeTicketPaymentAction(TICKET, PAY, "motivo")).error).toMatch(/caixa/);
  });
});

describe("reopenTicketAction", () => {
  it("POST em /reopen com o motivo", async () => {
    const res = await reopenTicketAction(TICKET, "item lançado errado");
    expect(res.ok).toBe(true);
    expect(authedFetch.mock.calls[0][0]).toBe(`/tickets/${TICKET}/reopen`);
    expect(JSON.parse(authedFetch.mock.calls[0][1].body)).toEqual({ reason: "item lançado errado" });
  });

  it("id inválido não chama o backend; recusa do backend (comissão repassada) é devolvida", async () => {
    expect((await reopenTicketAction("nao-uuid", "motivo")).ok).toBe(false);
    expect(authedFetch).not.toHaveBeenCalled();
    authedFetch.mockRejectedValue(new ApiError("a comissão já foi repassada", 409));
    expect(await reopenTicketAction(TICKET, "motivo")).toEqual({ ok: false, error: "a comissão já foi repassada" });
  });
});

describe("closeTicketAction", () => {
  // Regressão: depois de fechar, a tela voltava para a lista de comandas ABERTAS e a comanda "sumia". Agora fica na própria comanda.
  it("fecha SEM redirecionar e devolve a comanda fechada para a tela continuar nela", async () => {
    authedFetch.mockResolvedValue({ id: TICKET, status: "CLOSED" });
    const res = await closeTicketAction(TICKET);
    expect(res).toEqual({ ok: true, ticket: { id: TICKET, status: "CLOSED" } });
    expect(redirect).not.toHaveBeenCalled();
    expect(authedFetch.mock.calls[0][0]).toBe(`/tickets/${TICKET}/close`);
    expect(authedFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("se o servidor recusar (falta pagamento), devolve o erro e também não redireciona", async () => {
    authedFetch.mockRejectedValue(new ApiError("Faltam 1000 centavos em pagamento.", 400));
    expect(await closeTicketAction(TICKET)).toEqual({ ok: false, error: "Faltam 1000 centavos em pagamento." });
    expect(redirect).not.toHaveBeenCalled();
  });
});

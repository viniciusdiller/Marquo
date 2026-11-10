import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket, TicketAuditEntry } from "@marquo/shared-types";

vi.mock("../actions", () => ({
  addItemAction: vi.fn(),
  addPaymentAction: vi.fn(),
  cancelTicketAction: vi.fn(),
  closeTicketAction: vi.fn(),
  removeItemAction: vi.fn(),
  removeTicketPaymentAction: vi.fn(),
  reopenTicketAction: vi.fn(),
  setDiscountAction: vi.fn(),
  setTicketClientAction: vi.fn(),
  setTicketNoteAction: vi.fn(),
  updateTicketItemAction: vi.fn(),
  searchClientsAction: vi.fn(),
}));

import { TicketPdv } from "./TicketPdv";
import { removeTicketPaymentAction, reopenTicketAction, setTicketNoteAction, updateTicketItemAction } from "../actions";

const TEAM = [
  { id: "p1", name: "Alex" },
  { id: "p2", name: "Bruna" },
];

const open: Ticket = {
  id: "tk-1",
  status: "OPEN",
  appointmentId: null,
  client: null,
  note: null,
  openedAt: "2026-11-10T13:00:00.000Z",
  closedAt: null,
  canceledAt: null,
  discountCents: 0,
  clubCoveredCents: 0,
  subtotalCents: 5000,
  totalCents: 5000,
  paidCents: 5000,
  dueCents: 0,
  items: [
    {
      id: "it-1",
      kind: "SERVICE",
      serviceId: "s1",
      productId: null,
      description: "Corte",
      quantity: 1,
      unitPriceCents: 5000,
      totalCents: 5000,
      clubCoveredUnits: 0,
      clubCoveredCents: 0,
      createdAt: "2026-11-10T13:05:00.000Z",
      professional: { id: "p1", name: "Alex" },
    },
  ],
  payments: [{ id: "pay-1", method: "PIX", amountCents: 5000, createdAt: "2026-11-10T13:10:00.000Z" }],
};
const closed: Ticket = { ...open, status: "CLOSED", closedAt: "2026-11-10T13:20:00.000Z" };

const render1 = (ticket: Ticket, extra: { isOwner?: boolean; history?: TicketAuditEntry[] } = {}) =>
  render(<TicketPdv initialTicket={ticket} services={[]} products={[]} team={TEAM} {...extra} />);

beforeEach(() => {
  vi.mocked(updateTicketItemAction).mockReset().mockResolvedValue({ ok: true, ticket: open });
  vi.mocked(removeTicketPaymentAction).mockReset().mockResolvedValue({ ok: true, ticket: { ...open, payments: [], paidCents: 0, dueCents: 5000 } });
  vi.mocked(reopenTicketAction).mockReset().mockResolvedValue({ ok: true, ticket: open });
  vi.mocked(setTicketNoteAction).mockReset().mockResolvedValue({ ok: true, ticket: open });
});

describe("TicketPdv: editar item", () => {
  it("o lápis abre o editor; salvar envia SÓ o que mudou", async () => {
    const user = userEvent.setup();
    render1(open);
    await user.click(screen.getByRole("button", { name: "Editar item" }));

    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled(); // nada mudou
    await user.clear(screen.getByLabelText("Quantidade"));
    await user.type(screen.getByLabelText("Quantidade"), "3");
    await user.click(save);

    await waitFor(() => expect(updateTicketItemAction).toHaveBeenCalledWith("tk-1", "it-1", { quantity: 3 }));
  });

  it("trocar o profissional envia o id; 'Sem profissional' envia null", async () => {
    const user = userEvent.setup();
    render1(open);
    await user.click(screen.getByRole("button", { name: "Editar item" }));
    await user.selectOptions(screen.getByLabelText("Profissional"), "p2");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateTicketItemAction).toHaveBeenCalledWith("tk-1", "it-1", { professionalId: "p2" }));

    await user.click(screen.getByRole("button", { name: "Editar item" }));
    await user.selectOptions(screen.getByLabelText("Profissional"), "");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateTicketItemAction).toHaveBeenLastCalledWith("tk-1", "it-1", { professionalId: null }));
  });

  it("quantidade inválida bloqueia o salvar e avisa", async () => {
    const user = userEvent.setup();
    render1(open);
    await user.click(screen.getByRole("button", { name: "Editar item" }));
    await user.clear(screen.getByLabelText("Quantidade"));
    await user.type(screen.getByLabelText("Quantidade"), "0");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(screen.getByText(/inteiro de 1 a 10\.000/)).toBeInTheDocument();
  });

  it("não há como editar o preço (só quantidade e profissional)", async () => {
    const user = userEvent.setup();
    render1(open);
    await user.click(screen.getByRole("button", { name: "Editar item" }));
    const editor = screen.getByRole("group", { name: "Editar item" });
    expect(within(editor).getByLabelText("Quantidade")).toBeInTheDocument();
    expect(within(editor).getByLabelText("Profissional")).toBeInTheDocument();
    expect(within(editor).queryByLabelText(/preço|valor/i)).not.toBeInTheDocument();
    expect(within(editor).getAllByRole("spinbutton")).toHaveLength(1); // só a quantidade é numérica
  });

  it("comanda fechada não mostra editar nem remover", () => {
    render1(closed, { isOwner: true });
    expect(screen.queryByRole("button", { name: "Editar item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover item" })).not.toBeInTheDocument();
  });
});

describe("TicketPdv: estornar pagamento", () => {
  it("exige motivo antes de chamar o servidor", async () => {
    const user = userEvent.setup();
    render1(open);
    await user.click(screen.getByRole("button", { name: /Remover pagamento/ }));

    const dialog = screen.getByRole("alertdialog", { name: "Remover este pagamento?" });
    const confirm = within(dialog).getByRole("button", { name: "Remover pagamento" });
    expect(confirm).toBeDisabled();
    expect(removeTicketPaymentAction).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Motivo/), "Pix no valor errado");
    await user.click(confirm);
    await waitFor(() => expect(removeTicketPaymentAction).toHaveBeenCalledWith("tk-1", "pay-1", "Pix no valor errado"));
  });

  it("mostra o que será removido (forma e valor)", async () => {
    const user = userEvent.setup();
    render1(open);
    await user.click(screen.getByRole("button", { name: /Remover pagamento/ }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/Pix de R\$\s?50,00/);
  });

  it("comanda fechada não permite remover pagamento (só reabrindo)", () => {
    render1(closed, { isOwner: true });
    expect(screen.queryByRole("button", { name: /Remover pagamento/ })).not.toBeInTheDocument();
  });

  it("avisa que para cancelar é preciso remover antes os pagamentos", () => {
    render1(open);
    expect(screen.getByText(/remova antes os pagamentos registrados/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});

describe("TicketPdv: observação", () => {
  it("o botão de salvar só aparece quando o texto mudou e envia o texto aparado", async () => {
    const user = userEvent.setup();
    render1(open);
    expect(screen.queryByRole("button", { name: "Salvar observação" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Observação"), "  cliente alérgico  ");
    await user.click(screen.getByRole("button", { name: "Salvar observação" }));
    await waitFor(() => expect(setTicketNoteAction).toHaveBeenCalledWith("tk-1", "cliente alérgico"));
  });

  it("apagar o texto envia null (limpa)", async () => {
    const user = userEvent.setup();
    render1({ ...open, note: "antiga" });
    await user.clear(screen.getByLabelText("Observação"));
    await user.click(screen.getByRole("button", { name: "Salvar observação" }));
    await waitFor(() => expect(setTicketNoteAction).toHaveBeenCalledWith("tk-1", null));
  });

  it("em comanda fechada a observação aparece só para leitura", () => {
    render1({ ...closed, note: "pediu nota" });
    expect(screen.queryByLabelText("Observação")).not.toBeInTheDocument();
    expect(screen.getByText(/pediu nota/)).toBeInTheDocument();
  });
});

describe("TicketPdv: reabrir comanda fechada", () => {
  it("só o dono vê o botão", () => {
    const { unmount } = render1(closed, { isOwner: true });
    expect(screen.getByRole("button", { name: "Reabrir comanda" })).toBeInTheDocument();
    unmount();
    render1(closed, { isOwner: false });
    expect(screen.queryByRole("button", { name: "Reabrir comanda" })).not.toBeInTheDocument();
  });

  it("não aparece em comanda aberta nem cancelada", () => {
    const { unmount } = render1(open, { isOwner: true });
    expect(screen.queryByRole("button", { name: "Reabrir comanda" })).not.toBeInTheDocument();
    unmount();
    render1({ ...closed, status: "CANCELED" }, { isOwner: true });
    expect(screen.queryByRole("button", { name: "Reabrir comanda" })).not.toBeInTheDocument();
  });

  it("explica o que será desfeito, exige motivo e então reabre; a tela volta a ser editável", async () => {
    const user = userEvent.setup();
    render1(closed, { isOwner: true });
    await user.click(screen.getByRole("button", { name: "Reabrir comanda" }));

    const dialog = screen.getByRole("alertdialog", { name: "Reabrir esta comanda?" });
    expect(dialog).toHaveTextContent(/estorna a receita/);
    expect(dialog).toHaveTextContent(/já foi repassada/);
    const confirm = within(dialog).getByRole("button", { name: "Reabrir comanda" });
    expect(confirm).toBeDisabled();
    expect(reopenTicketAction).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Motivo/), "item lançado errado");
    await user.click(confirm);

    await waitFor(() => expect(reopenTicketAction).toHaveBeenCalledWith("tk-1", "item lançado errado"));
    expect(await screen.findByRole("button", { name: "Editar item" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reabrir comanda" })).not.toBeInTheDocument());
  });

  it("se o servidor recusar (comissão repassada) mostra o erro e a comanda segue fechada", async () => {
    vi.mocked(reopenTicketAction).mockResolvedValue({ ok: false, error: "a comissão de Alex já foi repassada" });
    const user = userEvent.setup();
    render1(closed, { isOwner: true });
    await user.click(screen.getByRole("button", { name: "Reabrir comanda" }));
    await user.type(screen.getByLabelText(/Motivo/), "tentar");
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reabrir comanda" }));

    expect(await screen.findByText(/já foi repassada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar item" })).not.toBeInTheDocument();
  });
});

describe("TicketPdv: histórico de alterações", () => {
  const history: TicketAuditEntry[] = [
    { id: "h1", action: "REOPENED", actorName: "Dona Marta", reason: "item lançado errado", detail: "Comanda reaberta: receita estornada", createdAt: "2026-11-10T14:00:00.000Z" },
  ];

  it("o dono vê quem, quando e por quê", () => {
    render1(open, { isOwner: true, history });
    expect(screen.getByText(/Histórico de alterações \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Comanda reaberta: receita estornada")).toBeInTheDocument();
    expect(screen.getByText(/Motivo: item lançado errado/)).toBeInTheDocument();
    expect(screen.getByText(/Dona Marta/)).toBeInTheDocument();
  });

  it("quem não é dono não vê o histórico, mesmo que a lista chegue", () => {
    render1(open, { isOwner: false, history });
    expect(screen.queryByText(/Histórico de alterações/)).not.toBeInTheDocument();
  });

  it("sem registros não mostra a seção", () => {
    render1(open, { isOwner: true, history: [] });
    expect(screen.queryByText(/Histórico de alterações/)).not.toBeInTheDocument();
  });
});

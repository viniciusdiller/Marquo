import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket } from "@marquo/shared-types";

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
import { closeTicketAction, reopenTicketAction } from "../actions";

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
      professional: null,
    },
  ],
  payments: [{ id: "pay-1", method: "PIX", amountCents: 5000, createdAt: "2026-11-10T13:10:00.000Z" }],
};
const closed: Ticket = { ...open, status: "CLOSED", closedAt: "2026-11-10T13:20:00.000Z" };

beforeEach(() => {
  vi.mocked(closeTicketAction).mockReset().mockResolvedValue({ ok: true, ticket: closed });
  vi.mocked(reopenTicketAction).mockReset().mockResolvedValue({ ok: true, ticket: open });
});

const renderOpen = (isOwner = false) => render(<TicketPdv initialTicket={open} services={[]} products={[]} team={[]} isOwner={isOwner} />);

describe("TicketPdv: fechar a comanda não a faz sumir", () => {
  it("depois de fechar, a tela CONTINUA na comanda (agora fechada, só leitura) com um aviso", async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole("button", { name: "Fechar comanda" }));

    await waitFor(() => expect(closeTicketAction).toHaveBeenCalledWith("tk-1"));
    expect(await screen.findByRole("status")).toHaveTextContent(/Comanda fechada\./);
    expect(screen.getByRole("status")).toHaveTextContent(/continua guardada/);
    // O registro segue ali: itens, total e pagamento. Mas não é mais editável.
    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fechar comanda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar item" })).not.toBeInTheDocument();
  });

  it("o aviso leva às comandas fechadas e de volta às abertas", async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole("button", { name: "Fechar comanda" }));
    expect(await screen.findByRole("link", { name: "Ver fechadas" })).toHaveAttribute("href", "/dashboard/comandas?aba=fechadas");
    expect(screen.getByRole("link", { name: "Voltar às abertas" })).toHaveAttribute("href", "/dashboard/comandas");
  });

  it("se o servidor recusar o fechamento, mostra o erro e a comanda segue aberta, sem aviso de fechada", async () => {
    vi.mocked(closeTicketAction).mockResolvedValue({ ok: false, error: "Faltam 1000 centavos em pagamento." });
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole("button", { name: "Fechar comanda" }));

    expect(await screen.findByText("Faltam 1000 centavos em pagamento.")).toBeInTheDocument();
    expect(screen.queryByText(/Comanda fechada\./)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar comanda" })).toBeInTheDocument();
  });

  it("o dono pode reabrir logo em seguida, e o aviso de 'fechada' some", async () => {
    const user = userEvent.setup();
    renderOpen(true);
    await user.click(screen.getByRole("button", { name: "Fechar comanda" }));
    await user.click(await screen.findByRole("button", { name: "Reabrir comanda" }));
    await user.type(screen.getByLabelText(/Motivo/), "item errado");
    await user.click(screen.getAllByRole("button", { name: "Reabrir comanda" }).at(-1)!);

    await waitFor(() => expect(reopenTicketAction).toHaveBeenCalledWith("tk-1", "item errado"));
    await waitFor(() => expect(screen.queryByText(/Comanda fechada\./)).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Fechar comanda" })).toBeInTheDocument();
  });

  it("quem abre uma comanda JÁ fechada (sem ter acabado de fechar) não vê o aviso, mas vê o registro", () => {
    render(<TicketPdv initialTicket={closed} services={[]} products={[]} team={[]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Corte")).toBeInTheDocument();
  });
});

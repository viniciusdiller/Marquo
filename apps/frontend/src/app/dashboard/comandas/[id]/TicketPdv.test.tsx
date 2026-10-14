import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket } from "@marquo/shared-types";
import { TicketPdv } from "./TicketPdv";
import { cancelTicketAction, removeItemAction, searchClientsAction, setTicketClientAction } from "../actions";

// Server Actions de verdade dependem de next/headers/cookies (contexto de requisição) — fora
// do runtime do Next elas não funcionam. O componente só importa as referências de função,
// então mockar o módulo inteiro basta pra testar a UI sem precisar de um backend.
vi.mock("../actions", () => ({
  addItemAction: vi.fn(),
  addPaymentAction: vi.fn(),
  cancelTicketAction: vi.fn(),
  closeTicketAction: vi.fn(),
  removeItemAction: vi.fn(),
  setDiscountAction: vi.fn(),
  setTicketClientAction: vi.fn(),
  searchClientsAction: vi.fn(),
}));

const baseTicket: Ticket = {
  id: "ticket-1",
  status: "OPEN",
  appointmentId: null,
  client: null,
  note: null,
  openedAt: "2026-10-06T13:00:00.000Z",
  closedAt: null,
  canceledAt: null,
  discountCents: 0,
  subtotalCents: 5000,
  totalCents: 5000,
  paidCents: 0,
  dueCents: 5000,
  items: [
    {
      id: "item-1",
      kind: "CUSTOM",
      serviceId: null,
      productId: null,
      description: "Corte de teste",
      quantity: 1,
      unitPriceCents: 5000,
      totalCents: 5000,
      createdAt: "2026-10-06T13:05:00.000Z",
      professional: null,
    },
  ],
  payments: [],
};

describe("TicketPdv", () => {
  beforeEach(() => {
    vi.mocked(removeItemAction).mockResolvedValue({ ok: true, ticket: { ...baseTicket, items: [] } });
    vi.mocked(cancelTicketAction).mockResolvedValue({ ok: true, ticket: { ...baseTicket, status: "CANCELED" } });
  });

  it("remover item pede confirmação antes de chamar removeItemAction", async () => {
    const user = userEvent.setup();
    render(<TicketPdv initialTicket={baseTicket} services={[]} products={[]} team={[]} />);

    await user.click(screen.getByRole("button", { name: "Remover item" }));

    const confirm = screen.getByRole("alertdialog", { name: "Remover este item?" });
    expect(confirm).toBeInTheDocument();
    expect(confirm).toHaveTextContent("Corte de teste");
    expect(removeItemAction).not.toHaveBeenCalled();
  });

  it("confirmar a remoção chama removeItemAction com o ticket e o item certos", async () => {
    const user = userEvent.setup();
    render(<TicketPdv initialTicket={baseTicket} services={[]} products={[]} team={[]} />);

    await user.click(screen.getByRole("button", { name: "Remover item" }));
    const confirm = screen.getByRole("alertdialog", { name: "Remover este item?" });
    await user.click(within(confirm).getByRole("button", { name: "Remover item" }));

    await waitFor(() => expect(removeItemAction).toHaveBeenCalledWith("ticket-1", "item-1"));
  });

  it("cancelar a comanda pede confirmação antes de chamar cancelTicketAction", async () => {
    const user = userEvent.setup();
    render(<TicketPdv initialTicket={baseTicket} services={[]} products={[]} team={[]} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const confirm = screen.getByRole("alertdialog", { name: "Cancelar esta comanda?" });
    expect(confirm).toBeInTheDocument();
    expect(cancelTicketAction).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Cancelar comanda" }));
    await waitFor(() => expect(cancelTicketAction).toHaveBeenCalledWith("ticket-1"));
  });

  it("mostra o registro de datas no fuso de São Paulo: abertura e quando cada item entrou", () => {
    render(<TicketPdv initialTicket={baseTicket} services={[]} products={[]} team={[]} />);
    expect(screen.getByText("Aberta em")).toBeInTheDocument();
    expect(screen.getByText("06/10/2026 às 10:00")).toBeInTheDocument();
    expect(screen.getByText(/adicionado 06\/10 10:05/)).toBeInTheDocument();
  });

  it("comanda fechada mostra 'Fechada em' e a data de cada pagamento", () => {
    const closed: Ticket = {
      ...baseTicket,
      status: "CLOSED",
      closedAt: "2026-10-06T14:30:00.000Z",
      paidCents: 5000,
      dueCents: 0,
      payments: [{ id: "p1", method: "PIX", amountCents: 5000, createdAt: "2026-10-06T14:25:00.000Z" }],
    };
    render(<TicketPdv initialTicket={closed} services={[]} products={[]} team={[]} />);
    expect(screen.getByText("Fechada em")).toBeInTheDocument();
    expect(screen.getByText("06/10/2026 às 11:30")).toBeInTheDocument();
    expect(screen.getByText("06/10/2026 às 11:25")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vincular cliente" })).not.toBeInTheDocument();
  });

  it("sem cliente: oferece 'Vincular cliente', busca e vincula o escolhido", async () => {
    const client = { id: "3f2b8c1e-8a3d-4c55-9d5e-0a1b2c3d4e5f", name: "Carla Souza", phone: "11987654321" };
    vi.mocked(searchClientsAction).mockResolvedValue({ ok: true, clients: [client] });
    vi.mocked(setTicketClientAction).mockResolvedValue({
      ok: true,
      ticket: { ...baseTicket, client },
    });
    const user = userEvent.setup();
    render(<TicketPdv initialTicket={baseTicket} services={[]} products={[]} team={[]} />);

    expect(screen.getByText("sem cliente vinculado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Vincular cliente" }));
    await user.type(screen.getByLabelText("Buscar cliente"), "carla");

    await user.click(await screen.findByRole("button", { name: /Carla Souza/ }));

    await waitFor(() => expect(setTicketClientAction).toHaveBeenCalledWith("ticket-1", client.id));
    expect(await screen.findByRole("link", { name: "Carla Souza" })).toHaveAttribute("href", `/dashboard/clientes/${client.id}`);
    expect(screen.getByRole("button", { name: "Trocar cliente" })).toBeInTheDocument();
  });

  it("com cliente: 'Remover' desvincula (clientId null)", async () => {
    const client = { id: "3f2b8c1e-8a3d-4c55-9d5e-0a1b2c3d4e5f", name: "Carla Souza", phone: "11987654321" };
    vi.mocked(setTicketClientAction).mockResolvedValue({ ok: true, ticket: { ...baseTicket, client: null } });
    const user = userEvent.setup();
    render(<TicketPdv initialTicket={{ ...baseTicket, client }} services={[]} products={[]} team={[]} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(setTicketClientAction).toHaveBeenCalledWith("ticket-1", null));
    expect(await screen.findByText("sem cliente vinculado")).toBeInTheDocument();
  });

  it("comanda vinda de agendamento não deixa trocar o cliente", () => {
    const client = { id: "3f2b8c1e-8a3d-4c55-9d5e-0a1b2c3d4e5f", name: "Carla Souza", phone: "11987654321" };
    render(<TicketPdv initialTicket={{ ...baseTicket, appointmentId: "ap-1", client }} services={[]} products={[]} team={[]} />);
    expect(screen.queryByRole("button", { name: "Trocar cliente" })).not.toBeInTheDocument();
    expect(screen.getByText(/o cliente é o do agendamento/)).toBeInTheDocument();
  });

  it("erro do servidor ao vincular aparece na tela", async () => {
    const client = { id: "3f2b8c1e-8a3d-4c55-9d5e-0a1b2c3d4e5f", name: "Carla Souza", phone: "11987654321" };
    vi.mocked(searchClientsAction).mockResolvedValue({ ok: true, clients: [client] });
    vi.mocked(setTicketClientAction).mockResolvedValue({ ok: false, error: "Cliente não encontrado." });
    const user = userEvent.setup();
    render(<TicketPdv initialTicket={baseTicket} services={[]} products={[]} team={[]} />);

    await user.click(screen.getByRole("button", { name: "Vincular cliente" }));
    await user.type(screen.getByLabelText("Buscar cliente"), "carla");
    await user.click(await screen.findByRole("button", { name: /Carla Souza/ }));

    expect(await screen.findByText("Cliente não encontrado.")).toBeInTheDocument();
  });
});

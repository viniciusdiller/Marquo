import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({ enrollClubMemberAction: vi.fn() }));
vi.mock("../comandas/actions", () => ({ searchClientsAction: vi.fn() }));

import { EnrollMemberForm } from "./EnrollMemberForm";
import { enrollClubMemberAction } from "./actions";
import { searchClientsAction } from "../comandas/actions";

const PLANS = [
  { id: "p1", name: "Clube do Corte", priceLabel: "R$ 120,00" },
  { id: "p2", name: "Clube Completo", priceLabel: "R$ 200,00" },
];
const client = { id: "c1", name: "Carla Souza", phone: "11987654321" };

beforeEach(() => {
  vi.mocked(enrollClubMemberAction).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(searchClientsAction).mockReset().mockResolvedValue({ ok: true, clients: [client] });
});

async function pickClient(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Buscar cliente"), "Carla");
  await user.click(await screen.findByText("Carla Souza"));
}

describe("EnrollMemberForm", () => {
  it("o botão só habilita depois de escolher o cliente", async () => {
    const user = userEvent.setup();
    render(<EnrollMemberForm plans={PLANS} />);
    const submit = screen.getByRole("button", { name: /Inscrever/ });
    expect(submit).toBeDisabled();

    await pickClient(user);
    expect(submit).toBeEnabled();
  });

  it("inscreve o cliente escolhido no pacote selecionado (só ids)", async () => {
    const user = userEvent.setup();
    render(<EnrollMemberForm plans={PLANS} />);
    await pickClient(user);
    await user.selectOptions(screen.getByLabelText("Pacote"), "p2");
    await user.click(screen.getByRole("button", { name: /Inscrever/ }));

    await waitFor(() => expect(enrollClubMemberAction).toHaveBeenCalledWith("c1", "p2"));
    expect(await screen.findByRole("status")).toHaveTextContent(/primeiro mês foi lançado/i);
  });

  it("mostra o erro do servidor (ex.: cliente já está no clube) e mantém o cliente escolhido", async () => {
    vi.mocked(enrollClubMemberAction).mockResolvedValue({ error: "Este cliente já está no clube." });
    const user = userEvent.setup();
    render(<EnrollMemberForm plans={PLANS} />);
    await pickClient(user);
    await user.click(screen.getByRole("button", { name: /Inscrever/ }));

    expect(await screen.findByText("Este cliente já está no clube.")).toBeInTheDocument();
    expect(screen.getByText("Carla Souza")).toBeInTheDocument();
  });

  it("sem pacote ativo: orienta a criar um", () => {
    render(<EnrollMemberForm plans={[]} />);
    expect(screen.getByText(/pelo menos um pacote/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inscrever/ })).not.toBeInTheDocument();
  });
});

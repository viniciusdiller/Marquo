import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({ renewClubMemberAction: vi.fn(), cancelClubMemberAction: vi.fn() }));

import { MemberActions } from "./MemberActions";
import { cancelClubMemberAction, renewClubMemberAction } from "./actions";

beforeEach(() => {
  vi.mocked(renewClubMemberAction).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(cancelClubMemberAction).mockReset().mockResolvedValue({ ok: true });
});

const props = { id: "m1", clientName: "Carla", priceLabel: "R$ 120,00" };

describe("MemberActions", () => {
  it("renovar pede confirmação (dinheiro) antes de chamar o servidor", async () => {
    const user = userEvent.setup();
    render(<MemberActions {...props} canRenew />);

    await user.click(screen.getByRole("button", { name: "Renovar" }));
    expect(renewClubMemberAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/Carla pagou R\$ 120,00/);

    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    await waitFor(() => expect(renewClubMemberAction).toHaveBeenCalledWith("m1"));
  });

  it("cancelar pede confirmação e só então cancela", async () => {
    const user = userEvent.setup();
    render(<MemberActions {...props} canRenew={false} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancelClubMemberAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancelar adesão" }));
    await waitFor(() => expect(cancelClubMemberAction).toHaveBeenCalledWith("m1"));
  });

  it("sem canRenew (o servidor decide) o botão Renovar nem aparece", () => {
    render(<MemberActions {...props} canRenew={false} />);
    expect(screen.queryByRole("button", { name: "Renovar" })).not.toBeInTheDocument();
  });

  it("erro do servidor aparece dentro do diálogo, sem fechar", async () => {
    vi.mocked(renewClubMemberAction).mockResolvedValue({ error: "Este mês ainda está em andamento." });
    const user = userEvent.setup();
    render(<MemberActions {...props} canRenew />);

    await user.click(screen.getByRole("button", { name: "Renovar" }));
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    expect(await screen.findByText("Este mês ainda está em andamento.")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("Esc/Cancelar do diálogo fecha sem chamar o servidor", async () => {
    const user = userEvent.setup();
    render(<MemberActions {...props} canRenew />);
    await user.click(screen.getByRole("button", { name: "Renovar" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(renewClubMemberAction).not.toHaveBeenCalled();
  });
});

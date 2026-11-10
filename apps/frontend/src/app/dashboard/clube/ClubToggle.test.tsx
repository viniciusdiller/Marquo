import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({ setClubEnabledAction: vi.fn() }));

import { ClubToggle } from "./ClubToggle";
import { setClubEnabledAction } from "./actions";

beforeEach(() => vi.mocked(setClubEnabledAction).mockReset().mockResolvedValue({ ok: true }));

describe("ClubToggle", () => {
  it("desligado: 'Ativar o clube' liga direto", async () => {
    const user = userEvent.setup();
    render(<ClubToggle enabled={false} />);
    await user.click(screen.getByRole("button", { name: "Ativar o clube" }));
    await waitFor(() => expect(setClubEnabledAction).toHaveBeenCalledWith(true));
  });

  it("ligado: desligar pede confirmação (a cobertura nas comandas para)", async () => {
    const user = userEvent.setup();
    render(<ClubToggle enabled />);
    await user.click(screen.getByRole("button", { name: "Desligar o clube" }));
    expect(setClubEnabledAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/voltam a ser cobrados/i);

    await user.click(screen.getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(setClubEnabledAction).toHaveBeenCalledWith(false));
  });

  it("mostra o erro do servidor ao tentar ativar (ex.: plano sem clube)", async () => {
    vi.mocked(setClubEnabledAction).mockResolvedValue({ error: "Disponível nos planos Profissional e Premium." });
    const user = userEvent.setup();
    render(<ClubToggle enabled={false} />);
    await user.click(screen.getByRole("button", { name: "Ativar o clube" }));
    expect(await screen.findByText("Disponível nos planos Profissional e Premium.")).toBeInTheDocument();
  });
});

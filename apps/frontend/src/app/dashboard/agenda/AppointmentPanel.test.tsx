import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicBooking } from "@marquo/shared-types";

const setAppointmentStatusAction = vi.fn();
vi.mock("./actions", () => ({
  cancelAppointmentAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
  setAppointmentStatusAction: (...args: unknown[]) => setAppointmentStatusAction(...args),
}));
const openTicketAction = vi.fn();
vi.mock("../comandas/actions", () => ({ openTicketAction: (...args: unknown[]) => openTicketAction(...args) }));

import { AppointmentPanel } from "./AppointmentPanel";

const booking = (status: PublicBooking["status"]): PublicBooking => ({
  id: "3f2b8f0e-0000-4000-8000-000000000001",
  professionalId: "3f2b8f0e-0000-4000-8000-000000000002",
  serviceId: "3f2b8f0e-0000-4000-8000-000000000003",
  clientName: "Fe",
  clientPhone: "22999447646",
  startAt: "2026-11-04T15:00:00.000Z",
  endAt: "2026-11-04T15:40:00.000Z",
  priceCentsSnapshot: 4000,
  status,
  rescheduledCount: 0,
});

function renderPanel(status: PublicBooking["status"], canManage = true, onChanged = vi.fn()) {
  render(<AppointmentPanel appointment={booking(status)} professionals={[]} canManage={canManage} onClose={vi.fn()} onChanged={onChanged} />);
  return onChanged;
}

describe("AppointmentPanel: botão Finalizado", () => {
  beforeEach(() => {
    setAppointmentStatusAction.mockReset();
    openTicketAction.mockReset();
  });

  it("confirmado: oferece Em atendimento, Finalizado e Faltou", () => {
    renderPanel("CONFIRMED");
    for (const name of ["Em atendimento", "Finalizado", "Faltou"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("Finalizado vai DIRETO: chama a ação com COMPLETED e atualiza a agenda", async () => {
    setAppointmentStatusAction.mockResolvedValue({ ok: true });
    const onChanged = renderPanel("CONFIRMED");

    await userEvent.click(screen.getByRole("button", { name: "Finalizado" }));

    await waitFor(() => expect(setAppointmentStatusAction).toHaveBeenCalledWith("3f2b8f0e-0000-4000-8000-000000000001", "COMPLETED"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("erro do servidor aparece e a agenda não é atualizada", async () => {
    setAppointmentStatusAction.mockResolvedValue({ ok: false, error: "Transição de status inválida." });
    const onChanged = renderPanel("CONFIRMED");

    await userEvent.click(screen.getByRole("button", { name: "Finalizado" }));

    expect(await screen.findByText(/transição de status inválida/i)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("em atendimento continua oferecendo Finalizado", () => {
    renderPanel("IN_SERVICE");
    expect(screen.getByRole("button", { name: "Finalizado" })).toBeInTheDocument();
  });

  it.each(["SCHEDULED", "NO_SHOW", "COMPLETED", "CANCELED"] as const)(
    "%s: não oferece Finalizado (o backend não permite essa transição)",
    (status) => {
      renderPanel(status);
      expect(screen.queryByRole("button", { name: "Finalizado" })).not.toBeInTheDocument();
    },
  );

  it("sem permissão de gerenciar (profissional): nenhum botão de status", () => {
    renderPanel("CONFIRMED", false);
    expect(screen.queryByRole("button", { name: "Finalizado" })).not.toBeInTheDocument();
  });
});

describe("AppointmentPanel: Abrir comanda", () => {
  beforeEach(() => openTicketAction.mockReset());

  it("chama a ação com o id do atendimento (o redirect para a comanda vem da própria ação)", async () => {
    openTicketAction.mockResolvedValue({ ok: true });
    renderPanel("CONFIRMED");

    await userEvent.click(screen.getByRole("button", { name: "Abrir comanda" }));

    await waitFor(() => expect(openTicketAction).toHaveBeenCalledWith({ appointmentId: "3f2b8f0e-0000-4000-8000-000000000001" }));
  });

  it("se falhar, MOSTRA o erro no painel (antes o clique parecia não fazer nada)", async () => {
    openTicketAction.mockResolvedValue({ ok: false, error: "Atendimento não encontrado." });
    const onChanged = renderPanel("CONFIRMED");

    await userEvent.click(screen.getByRole("button", { name: "Abrir comanda" }));

    expect(await screen.findByText("Atendimento não encontrado.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

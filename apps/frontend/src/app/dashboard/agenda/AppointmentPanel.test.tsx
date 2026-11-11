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

function renderPanel(status: PublicBooking["status"], canManage = true, onChanged = vi.fn(), onClose = vi.fn()) {
  render(<AppointmentPanel appointment={booking(status)} professionals={[]} canManage={canManage} onClose={onClose} onChanged={onChanged} />);
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

describe("AppointmentPanel: pop-up no meio da tela", () => {
  it("é um diálogo modal com o nome do cliente como título, fora da árvore do componente (portal no body)", () => {
    const { baseElement } = render(
      <AppointmentPanel appointment={booking("CONFIRMED")} professionals={[]} canManage onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Fe" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(baseElement.querySelector("body > div[role='presentation']")).not.toBeNull();
  });

  it("mostra horário com a duração, profissional, total e o WhatsApp do cliente", () => {
    renderPanel("CONFIRMED");
    expect(screen.getByText(/40 min/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chamar fe no whatsapp/i })).toHaveAttribute("href", "https://wa.me/5522999447646");
  });

  it("fecha pelo X, pelo Esc e clicando fora; clicar dentro NÃO fecha", async () => {
    const onClose = vi.fn();
    renderPanel("CONFIRMED", true, vi.fn(), onClose);

    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("Remarcar abre e fecha a área de remarcação (começa fechada)", async () => {
    renderPanel("CONFIRMED");
    // O campo agora é data + hora (DateTimePicker): o rótulo "Remarcar para" nomeia o grupo, não um input único.
    expect(screen.queryByRole("group", { name: /remarcar para/i })).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Remarcar" });
    await userEvent.click(toggle);
    expect(screen.getByRole("group", { name: /remarcar para/i })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(screen.queryByRole("group", { name: /remarcar para/i })).not.toBeInTheDocument();
  });

  it("finalizado/cancelado: sem Remarcar e sem Cancelar atendimento", () => {
    renderPanel("COMPLETED");
    expect(screen.queryByRole("button", { name: "Remarcar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancelar atendimento/i })).not.toBeInTheDocument();
  });

  it("cancelar pede confirmação antes; o Esc do 'tem certeza?' não fecha o pop-up por baixo", async () => {
    const onClose = vi.fn();
    renderPanel("CONFIRMED", true, vi.fn(), onClose);

    await userEvent.click(screen.getByRole("button", { name: /cancelar atendimento/i }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

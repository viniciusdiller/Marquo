import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTime } from "luxon";
import type { CalendarResponse, PublicBooking } from "@marquo/shared-types";

vi.mock("./actions", () => ({ fetchCalendarAction: vi.fn() }));
vi.mock("./AppointmentPanel", () => ({
  AppointmentPanel: ({ appointment }: { appointment: PublicBooking }) => <div role="dialog" aria-label="Detalhe">{appointment.clientName} aberto</div>,
}));
vi.mock("./CreateAppointmentDialog", () => ({ CreateAppointmentDialog: () => <div role="dialog" aria-label="Novo atendimento (form)" /> }));
vi.mock("@/components/dashboard/SetupGuide", () => ({ SetupGuide: () => null }));

import { AgendaView } from "./AgendaView";

// Quarta-feira passada: sem "hoje", sem linha de agora, e com dia da semana conhecido (WEDNESDAY).
const DAY = "2026-11-04";
const iso = (hhmm: string) => `${DAY}T${hhmm}:00-03:00`;

function booking(over: Partial<PublicBooking> & { id: string; startAt: string; endAt: string }): PublicBooking {
  return {
    professionalId: "p1",
    serviceId: "s1",
    clientName: "Cliente",
    clientPhone: "11999990000",
    priceCentsSnapshot: 5000,
    status: "SCHEDULED",
    rescheduledCount: 0,
    items: [{ serviceName: "Corte masculino" } as never],
    ...over,
  };
}

function calendar(appointments: PublicBooking[], professionals?: CalendarResponse["professionals"]): CalendarResponse {
  return {
    professionals: professionals ?? [
      { id: "p1", name: "Del Bianco", slotGranularityMinutes: 15, workingHours: [{ weekday: "WEDNESDAY", startMinute: 540, endMinute: 1080 }] },
    ],
    appointments,
    timeBlocks: [],
  };
}

function setup(cal: CalendarResponse, extra: { date?: string; canEdit?: boolean } = {}) {
  return render(<AgendaView initialDate={extra.date ?? DAY} initialCalendar={cal} services={[]} canEdit={extra.canEdit ?? true} />);
}

describe("AgendaView", () => {
  it("resume o dia: total de atendimentos (sem cancelados) e quantos esperam confirmação", () => {
    setup(
      calendar([
        booking({ id: "a", clientName: "Rafael", startAt: iso("10:00"), endAt: iso("10:40"), status: "SCHEDULED" }),
        booking({ id: "b", clientName: "Bruno", startAt: iso("11:00"), endAt: iso("11:40"), status: "CONFIRMED" }),
        booking({ id: "c", clientName: "Caio", startAt: iso("12:00"), endAt: iso("12:40"), status: "CANCELED" }),
      ]),
    );
    expect(screen.getByText(/2/, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/1 pendente de confirmação/)).toBeInTheDocument();
  });

  it("data com maiúscula só na primeira letra", () => {
    setup(calendar([]));
    expect(screen.getByText("Quarta-feira, 4 de novembro")).toBeInTheDocument();
  });

  it("a coluna do profissional mostra nome, iniciais e a contagem do dia", () => {
    setup(calendar([booking({ id: "a", clientName: "Rafael", startAt: iso("10:00"), endAt: iso("10:40") })]));
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.getAllByText("Del Bianco").length).toBeGreaterThan(0);
    expect(screen.getByText("1 atendimento")).toBeInTheDocument();
  });

  it("profissional sem expediente no dia aparece como 'Sem expediente'", () => {
    setup(calendar([], [{ id: "p1", name: "Del Bianco", slotGranularityMinutes: 15, workingHours: [] }]));
    expect(screen.getByText("Sem expediente")).toBeInTheDocument();
  });

  it("o cartão mostra faixa de horário, cliente e serviço quando cabe", () => {
    // 40 min x 1,5 px = 60 px: cabe as três linhas.
    setup(calendar([booking({ id: "a", clientName: "Rafael", startAt: iso("11:00"), endAt: iso("11:40") })]));
    const card = screen.getByRole("button", { name: /Rafael/ });
    expect(within(card).getByText("11:00 – 11:40")).toBeInTheDocument();
    expect(within(card).getByText("Corte masculino")).toBeInTheDocument();
  });

  it("atendimento curto vira uma linha só (horário e cliente), sem serviço", () => {
    setup(calendar([booking({ id: "a", clientName: "Rafael", startAt: iso("11:00"), endAt: iso("11:15") })]));
    const card = screen.getByRole("button", { name: /Rafael/ });
    expect(within(card).getByText("11:00")).toBeInTheDocument();
    expect(within(card).queryByText("Corte masculino")).not.toBeInTheDocument();
  });

  it("clicar no cartão abre o detalhe do atendimento", async () => {
    setup(calendar([booking({ id: "a", clientName: "Rafael", startAt: iso("11:00"), endAt: iso("11:40") })]));
    await userEvent.click(screen.getByRole("button", { name: /Rafael/ }));
    expect(screen.getByRole("dialog", { name: "Detalhe" })).toHaveTextContent("Rafael aberto");
  });

  it("dia vazio: avisa e, para quem pode agendar, sugere clicar num horário", () => {
    setup(calendar([]));
    expect(screen.getByText(/Nenhum atendimento neste dia\. Clique num horário livre para agendar\./)).toBeInTheDocument();
  });

  it("o botão 'Novo atendimento' abre o formulário", async () => {
    setup(calendar([]));
    await userEvent.click(screen.getByRole("button", { name: "Novo atendimento" }));
    expect(screen.getByRole("dialog", { name: "Novo atendimento (form)" })).toBeInTheDocument();
  });

  it("no dia de hoje mostra o selo 'Hoje'; em outro dia, não", () => {
    const today = DateTime.now().setZone("America/Sao_Paulo").toISODate()!;
    const { unmount } = setup(calendar([]), { date: today });
    // "Hoje" aparece no selo e no botão de navegação.
    expect(screen.getAllByText("Hoje")).toHaveLength(2);
    unmount();
    setup(calendar([]));
    expect(screen.getAllByText("Hoje")).toHaveLength(1);
  });

  it("sem profissionais ativos mostra o estado vazio com o caminho para cadastrar", () => {
    setup(calendar([], []));
    expect(screen.getByText("Nenhum profissional ativo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cadastrar profissionais" })).toHaveAttribute("href", "/dashboard/profissionais");
  });
});

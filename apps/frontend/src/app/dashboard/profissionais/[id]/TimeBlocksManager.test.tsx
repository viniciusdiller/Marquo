import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  createTimeBlockAction: vi.fn(),
  deleteTimeBlockAction: vi.fn(),
}));

import { TimeBlocksManager } from "./TimeBlocksManager";

const single = { id: "b1", startAt: "2026-11-16T15:00:00.000Z", endAt: "2026-11-16T16:00:00.000Z", reason: "Dentista", recurrence: "NONE" as const, repeatUntil: null };
const daily = { id: "b2", startAt: "2026-11-16T15:00:00.000Z", endAt: "2026-11-16T16:00:00.000Z", reason: "Almoço", recurrence: "DAILY" as const, repeatUntil: null };

describe("TimeBlocksManager", () => {
  it("começa em 'Só neste dia' e 'Todo dia' mostra a data final opcional", async () => {
    render(<TimeBlocksManager professionalId="p1" blocks={[]} />);
    expect(screen.getByRole("radio", { name: "Só neste dia" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/repetir até/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Todo dia" }));
    expect(screen.getByRole("radio", { name: "Todo dia" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/repetir até \(opcional\)/i)).toBeInTheDocument();
    expect(screen.getByText("A partir de")).toBeInTheDocument();
  });

  it("o formulário envia repeat=NONE por padrão e DAILY ao escolher 'Todo dia'", async () => {
    const { container } = render(<TimeBlocksManager professionalId="p1" blocks={[]} />);
    const form = () => new FormData(container.querySelector("form")!);
    expect(form().get("repeat")).toBe("NONE");
    await userEvent.click(screen.getByRole("radio", { name: "Todo dia" }));
    expect(form().get("repeat")).toBe("DAILY");
  });

  it("lista bloqueio único com a data e o diário como 'Todo dia das 12:00 às 13:00'", () => {
    render(<TimeBlocksManager professionalId="p1" blocks={[single, daily]} />);
    expect(screen.getByText("16/11 das 12:00 às 13:00")).toBeInTheDocument();
    expect(screen.getByText(/Todo dia das 12:00 às 13:00 · a partir de 16\/11, sem data final/)).toBeInTheDocument();
  });

  it("bloqueio diário com data final mostra até quando vale", () => {
    render(<TimeBlocksManager professionalId="p1" blocks={[{ ...daily, repeatUntil: "2026-12-31T00:00:00.000Z" }]} />);
    expect(screen.getByText(/até 31\/12\/2026/)).toBeInTheDocument();
  });
});

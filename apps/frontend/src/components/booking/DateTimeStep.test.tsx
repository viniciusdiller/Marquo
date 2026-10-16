import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTime } from "luxon";
import { DateTimeStep } from "./DateTimeStep";

const TZ = "America/Sao_Paulo";
const today = () => DateTime.now().setZone(TZ).startOf("day");

function renderStep(over: Partial<React.ComponentProps<typeof DateTimeStep>> = {}) {
  const onSelectDate = vi.fn();
  render(
    <DateTimeStep
      selectedDate={today().toISODate()!}
      onSelectDate={onSelectDate}
      slots={[]}
      isLoadingSlots={false}
      selectedSlot={null}
      onSelectSlot={() => {}}
      onJoinWaitlist={() => {}}
      {...over}
    />,
  );
  return { onSelectDate };
}

// O jsdom não faz layout: simulamos a faixa mais larga que a janela (scrollWidth > clientWidth), que é a situação
// real em que o último dia aparecia cortado sem nenhuma pista de que dava para rolar.
function fakeOverflow(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollBy = vi.fn() as unknown as typeof Element.prototype.scrollBy;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DateTimeStep: faixa de dias", () => {
  it("mostra 14 dias, com o selecionado marcado (aria-pressed) e o mês como contexto", () => {
    renderStep();
    const group = screen.getByRole("group", { name: "Dias disponíveis" });
    expect(group.querySelectorAll("button")).toHaveLength(14);
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(screen.getByText(new RegExp(String(today().year)))).toBeInTheDocument();
  });

  it("clicar num dia escolhe aquela data", async () => {
    const user = userEvent.setup();
    const { onSelectDate } = renderStep();
    const next = today().plus({ days: 3 });
    await user.click(screen.getByRole("button", { name: new RegExp(`${next.day} de`) }));
    expect(onSelectDate).toHaveBeenCalledWith(next.toISODate());
  });

  it("rola até o dia selecionado (nunca fica escondido fora da tela)", () => {
    renderStep();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("quando há mais dias à direita, mostra a seta e ela rola a faixa", async () => {
    fakeOverflow(1200, 360);
    const user = userEvent.setup();
    renderStep();
    const next = await screen.findByRole("button", { name: "Próximos dias" });
    expect(screen.queryByRole("button", { name: "Dias anteriores" })).not.toBeInTheDocument();
    await user.click(next);
    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("sem estouro (cabe tudo), não mostra setas", () => {
    fakeOverflow(300, 360);
    renderStep();
    expect(screen.queryByRole("button", { name: "Próximos dias" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dias anteriores" })).not.toBeInTheDocument();
  });
});

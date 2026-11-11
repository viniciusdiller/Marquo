import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";
import { DateTimePicker } from "./date-time-picker";

describe("DatePicker", () => {
  it("mostra a data em dd/MM/aaaa e escolhe um dia no calendário em português", async () => {
    const onChange = vi.fn();
    render(<DatePicker label="Data" defaultValue="2026-11-09" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /09\/11\/2026/ });
    await userEvent.click(trigger);
    expect(screen.getByText(/novembro 2026/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /, 15 de novembro/i }));
    expect(onChange).toHaveBeenCalledWith("2026-11-15");
    expect(screen.getByRole("button", { name: /15\/11\/2026/ })).toBeInTheDocument();
  });

  it("envia o valor no formulário pelo name (yyyy-MM-dd, como o input nativo)", () => {
    const { container } = render(
      <form>
        <DatePicker name="dueDate" defaultValue="2026-11-09" />
      </form>,
    );
    const data = new FormData(container.querySelector("form")!);
    expect(data.get("dueDate")).toBe("2026-11-09");
  });

  it("dias fora de min/max ficam desabilitados e não podem ser escolhidos", async () => {
    const onChange = vi.fn();
    render(<DatePicker label="Data" defaultValue="2026-11-15" min="2026-11-10" max="2026-11-20" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /15\/11\/2026/ }));
    expect(screen.getByRole("button", { name: /, 5 de novembro/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /, 25 de novembro/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /, 12 de novembro/i })).toBeEnabled();
  });

  it("'Limpar' esvazia o campo opcional", async () => {
    const onChange = vi.fn();
    render(<DatePicker label="Data" defaultValue="2026-11-09" clearable onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /09\/11\/2026/ }));
    await userEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("button", { name: /escolha a data/i })).toBeInTheDocument();
  });

  it("valor vazio mostra o placeholder e o campo escondido fica vazio (required barra o envio)", () => {
    const { container } = render(
      <form>
        <DatePicker name="d" required />
      </form>,
    );
    expect(screen.getByRole("button", { name: /escolha a data/i })).toBeInTheDocument();
    expect(container.querySelector("form")!.checkValidity()).toBe(false);
  });

  it("Esc fecha só o calendário", async () => {
    render(<DatePicker label="Data" defaultValue="2026-11-09" />);
    await userEvent.click(screen.getByRole("button", { name: /09\/11\/2026/ }));
    expect(screen.getByText(/novembro 2026/i)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/novembro 2026/i)).not.toBeInTheDocument();
  });
});

describe("TimePicker", () => {
  it("escolhe hora e minuto e devolve HH:mm", async () => {
    const onChange = vi.fn();
    render(<TimePicker label="Início" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /--:--/ }));
    await userEvent.click(within(screen.getByRole("listbox", { name: "Hora" })).getByRole("option", { name: "14" }));
    expect(onChange).toHaveBeenLastCalledWith("14:00");
    await userEvent.click(within(screen.getByRole("listbox", { name: "Minuto" })).getByRole("option", { name: "30" }));
    expect(onChange).toHaveBeenLastCalledWith("14:30");
  });

  it("minuto salvo fora do passo (ex.: 09:07) continua aparecendo e selecionado", async () => {
    render(<TimePicker label="Início" defaultValue="09:07" />);
    await userEvent.click(screen.getByRole("button", { name: /09:07/ }));
    expect(within(screen.getByRole("listbox", { name: "Minuto" })).getByRole("option", { name: "07", selected: true })).toBeInTheDocument();
  });

  it("horários bloqueados não podem ser escolhidos", async () => {
    const onChange = vi.fn();
    render(<TimePicker label="Início" defaultValue="10:00" isTimeDisabled={(h) => h < 9} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /10:00/ }));
    expect(within(screen.getByRole("listbox", { name: "Hora" })).getByRole("option", { name: "08" })).toBeDisabled();
    expect(within(screen.getByRole("listbox", { name: "Hora" })).getByRole("option", { name: "09" })).toBeEnabled();
  });

  it("vai no formulário pelo name", () => {
    const { container } = render(
      <form>
        <TimePicker name="startTime" defaultValue="12:00" />
      </form>,
    );
    expect(new FormData(container.querySelector("form")!).get("startTime")).toBe("12:00");
  });
});

describe("DateTimePicker", () => {
  function Controlled({ min }: { min?: string }) {
    const [value, setValue] = useState("");
    return (
      <>
        <DateTimePicker label="Início" value={value} onChange={setValue} min={min} />
        <output data-testid="out">{value}</output>
      </>
    );
  }

  it("só tem valor quando data E hora estão preenchidas", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: /Início \(data\)/ }));
    // Escolhe o dia 15 (único dia 15 do mês exibido; os dias "fora do mês" são outros números).
    await userEvent.click(screen.getByRole("button", { name: /, 15 de / }));
    expect(screen.getByTestId("out")).toHaveTextContent("");
    await userEvent.click(screen.getByRole("button", { name: /Início \(hora\)/ }));
    await userEvent.click(within(screen.getByRole("listbox", { name: "Hora" })).getByRole("option", { name: "09" }));
    expect(screen.getByTestId("out").textContent).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/);
  });

  it("no dia do mínimo, horários anteriores ficam bloqueados", async () => {
    render(<DateTimePicker label="Início" defaultValue="2026-11-09T15:00" min="2026-11-09T14:00" />);
    await userEvent.click(screen.getByRole("button", { name: /Início \(hora\)/ }));
    const hours = within(screen.getByRole("listbox", { name: "Hora" }));
    expect(hours.getByRole("option", { name: "13" })).toBeDisabled();
    expect(hours.getByRole("option", { name: "14" })).toBeEnabled();
  });

  it("envia 'yyyy-MM-ddTHH:mm' no formulário (formato do datetime-local)", () => {
    const { container } = render(
      <form>
        <DateTimePicker label="Início" name="startAt" defaultValue="2026-11-09T14:30" />
      </form>,
    );
    expect(new FormData(container.querySelector("form")!).get("startAt")).toBe("2026-11-09T14:30");
  });
});

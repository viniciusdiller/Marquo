import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({ createClubPlanAction: vi.fn() }));

import { CreatePlanForm } from "./CreatePlanForm";

const SERVICES = [
  { id: "s1", name: "Corte masculino" },
  { id: "s2", name: "Barba" },
];

describe("CreatePlanForm", () => {
  it("lista os serviços ativos como caixas de marcação serviceIds e os campos do pacote", () => {
    render(<CreatePlanForm services={SERVICES} />);
    const corte = screen.getByRole("checkbox", { name: "Corte masculino" });
    expect(corte).toHaveAttribute("name", "serviceIds");
    expect(corte).toHaveAttribute("value", "s1");
    expect(screen.getByLabelText("Nome do pacote")).toBeRequired();
    expect(screen.getByLabelText("Valor mensal (R$)")).toBeRequired();
    expect(screen.getByLabelText("Usos por mês")).toHaveValue(4);
    expect(screen.getByRole("button", { name: "Criar pacote" })).toBeEnabled();
  });

  it("limita os usos por mês de 1 a 60 no próprio campo", () => {
    render(<CreatePlanForm services={SERVICES} />);
    const uses = screen.getByLabelText("Usos por mês");
    expect(uses).toHaveAttribute("min", "1");
    expect(uses).toHaveAttribute("max", "60");
  });

  it("sem serviços ativos: orienta e não mostra formulário", () => {
    render(<CreatePlanForm services={[]} />);
    expect(screen.getByText(/Cadastre pelo menos um serviço ativo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar pacote" })).not.toBeInTheDocument();
  });
});

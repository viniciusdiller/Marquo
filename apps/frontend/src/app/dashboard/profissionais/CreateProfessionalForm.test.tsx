import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({ createProfessionalAction: vi.fn() }));

import { CreateProfessionalForm } from "./CreateProfessionalForm";

const SERVICES = [
  { id: "s1", name: "Corte masculino" },
  { id: "s2", name: "Barba" },
];

describe("CreateProfessionalForm — serviços", () => {
  it("lista os serviços ativos como caixas de marcação com o nome serviceIds", () => {
    render(<CreateProfessionalForm services={SERVICES} />);
    const corte = screen.getByRole("checkbox", { name: "Corte masculino" });
    expect(corte).toHaveAttribute("name", "serviceIds");
    expect(corte).toHaveAttribute("value", "s1");
    expect(screen.getByRole("checkbox", { name: "Barba" })).not.toBeChecked();
    expect(screen.getByText(/Nenhum marcado/)).toBeInTheDocument();
  });

  it("conta os marcados e permite marcar e desmarcar todos", async () => {
    render(<CreateProfessionalForm services={SERVICES} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Barba" }));
    expect(screen.getByText("1 de 2 marcado.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Marcar todos" }));
    expect(screen.getByRole("checkbox", { name: "Corte masculino" })).toBeChecked();
    expect(screen.getByText("2 de 2 marcados.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    expect(screen.getByRole("checkbox", { name: "Barba" })).not.toBeChecked();
  });

  it("sem serviços cadastrados: orienta a cadastrar e o formulário continua utilizável", () => {
    render(<CreateProfessionalForm services={[]} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cadastre os serviços" })).toHaveAttribute("href", "/dashboard/servicos");
    expect(screen.getByRole("button", { name: "Cadastrar profissional" })).toBeEnabled();
  });
});

describe("CreateProfessionalForm — dono que também atende", () => {
  it("sem selfEmail (dono já atende ou não é dono) a opção não aparece", () => {
    render(<CreateProfessionalForm services={SERVICES} />);
    expect(screen.queryByRole("checkbox", { name: /Eu também atendo/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("com selfEmail oferece a opção, mostrando o login que o dono já usa", () => {
    render(<CreateProfessionalForm services={SERVICES} selfEmail="dono@barbearia.com" />);
    const option = screen.getByRole("checkbox", { name: /Eu também atendo/ });
    expect(option).toHaveAttribute("name", "self");
    expect(option).not.toBeChecked();
    expect(screen.getByText(/dono@barbearia\.com/)).toBeInTheDocument();
  });

  it("marcada, esconde nome/e-mail/senha (não exige outra conta), troca o botão e mantém os serviços", async () => {
    render(<CreateProfessionalForm services={SERVICES} selfEmail="dono@barbearia.com" />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Eu também atendo/ }));

    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/E-mail/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Senha inicial")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar a mim como profissional" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Barba" })).toBeInTheDocument();
  });

  it("desmarcada de novo, os campos voltam", async () => {
    render(<CreateProfessionalForm services={SERVICES} selfEmail="dono@barbearia.com" />);
    const option = screen.getByRole("checkbox", { name: /Eu também atendo/ });
    await userEvent.click(option);
    await userEvent.click(option);
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar profissional" })).toBeInTheDocument();
  });
});

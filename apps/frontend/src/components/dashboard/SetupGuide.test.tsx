import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TenantSetupStatus } from "@marquo/shared-types";
import { SetupGuide } from "./SetupGuide";

const mockStatus: TenantSetupStatus = {
  isFullySetup: false,
  isReadyForBooking: false,
  completedStepsCount: 1,
  totalStepsCount: 6,
  slug: "barbearia-teste",
  steps: [
    {
      id: "services",
      title: "Cadastrar serviços",
      description: "Adicione cortes e barba",
      isComplete: true,
      href: "/dashboard/servicos",
      importance: "critical",
    },
    {
      id: "professionals",
      title: "Cadastrar equipe / barbeiros",
      description: "Cadastre pelo menos um profissional",
      isComplete: false,
      href: "/dashboard/profissionais",
      importance: "critical",
    },
    {
      id: "working_hours",
      title: "Definir horários de expediente",
      description: "Configure os dias da semana",
      isComplete: false,
      href: "/dashboard/profissionais",
      importance: "critical",
    },
    {
      id: "service_links",
      title: "Vincular serviços ao barbeiro",
      description: "Defina quais serviços cada um faz",
      isComplete: false,
      href: "/dashboard/profissionais",
      importance: "critical",
    },
    {
      id: "location",
      title: "Endereço e localização",
      description: "Informe o endereço no mapa",
      isComplete: false,
      href: "/dashboard/configuracoes",
      importance: "recommended",
    },
    {
      id: "contact",
      title: "WhatsApp de atendimento",
      description: "Adicione o número",
      isComplete: false,
      href: "/dashboard/configuracoes",
      importance: "recommended",
    },
  ],
};

describe("SetupGuide", () => {
  it("renderiza o título, progresso e etapas", () => {
    render(<SetupGuide setup={mockStatus} />);

    expect(screen.getByText("Guia de Configuração da Barbearia")).toBeInTheDocument();
    expect(screen.getByText("1/6 (17%)")).toBeInTheDocument();
    expect(screen.getByText("Cadastrar serviços")).toBeInTheDocument();
    expect(screen.getByText("Cadastrar equipe / barbeiros")).toBeInTheDocument();
  });

  it("exibe o destaque da Regra de Ouro quando vínculo de serviços está incompleto", () => {
    render(<SetupGuide setup={mockStatus} />);

    expect(
      screen.getByText(/Para que o cliente veja horários disponíveis, o barbeiro precisa ter este serviço habilitado/i),
    ).toBeInTheDocument();
  });

  it("exibe banner de sucesso e link de teste quando pronto para agendar", () => {
    const readyStatus: TenantSetupStatus = {
      ...mockStatus,
      isReadyForBooking: true,
      completedStepsCount: 4,
    };

    render(<SetupGuide setup={readyStatus} />);

    expect(
      screen.getByText(/Os requisitos essenciais estão prontos! Sua agenda pública já pode receber clientes./i),
    ).toBeInTheDocument();

    const testLink = screen.getByRole("link", { name: /testar como seu cliente vê/i });
    expect(testLink).toHaveAttribute("href", "/barbearia-teste/agendar");
    expect(testLink).toHaveAttribute("target", "_blank");
  });

  it("permite recolher e expandir o guia", async () => {
    const user = userEvent.setup();
    render(<SetupGuide setup={mockStatus} />);

    const toggleButton = screen.getByRole("button", { name: /recolher guia de configuração/i });
    await user.click(toggleButton);

    expect(screen.queryByText("Definir horários de expediente")).not.toBeInTheDocument();

    await user.click(toggleButton);
    expect(screen.getByText("Definir horários de expediente")).toBeInTheDocument();
  });

  it("não renderiza nada quando a configuração está 100% concluída", () => {
    const fullySetupStatus: TenantSetupStatus = {
      ...mockStatus,
      isFullySetup: true,
      isReadyForBooking: true,
      completedStepsCount: 6,
      totalStepsCount: 6,
    };

    const { container } = render(<SetupGuide setup={fullySetupStatus} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Guia de Configuração da Barbearia")).not.toBeInTheDocument();
  });
});


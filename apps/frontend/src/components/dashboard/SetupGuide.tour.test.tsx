import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TenantSetupStatus } from "@marquo/shared-types";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/agenda", useRouter: () => ({ push: vi.fn() }) }));

import { TourProvider } from "@/components/tour/TourProvider";
import { readTourState } from "@/components/tour/tour-state";
import { SetupGuide } from "./SetupGuide";

const status: TenantSetupStatus = {
  isFullySetup: false,
  isReadyForBooking: false,
  completedStepsCount: 1,
  totalStepsCount: 3,
  slug: "barbearia-teste",
  steps: [
    { id: "services", title: "Cadastrar serviços", description: "d", isComplete: true, href: "/dashboard/servicos", importance: "critical" },
    { id: "professionals", title: "Cadastrar equipe", description: "d", isComplete: false, href: "/dashboard/profissionais", importance: "critical" },
    { id: "contact", title: "WhatsApp de atendimento", description: "d", isComplete: false, href: "/dashboard/configuracoes", importance: "optional" },
  ],
} as TenantSetupStatus;

describe("SetupGuide: inicia o tour guiado", () => {
  beforeEach(() => sessionStorage.clear());

  it("'Configurar agora' liga o tour do passo (e o link continua levando para a tela)", async () => {
    render(
      <TourProvider>
        <SetupGuide setup={status} />
      </TourProvider>,
    );

    const configure = screen.getAllByRole("link", { name: /configurar agora/i });
    expect(configure[0]).toHaveAttribute("href", "/dashboard/profissionais");
    await userEvent.click(configure[0]);

    expect(readTourState()).toEqual({ tourId: "professionals", index: 0 });
  });

  it("cada passo inicia o tour do SEU id", async () => {
    render(
      <TourProvider>
        <SetupGuide setup={status} />
      </TourProvider>,
    );

    await userEvent.click(screen.getAllByRole("link", { name: /configurar agora/i })[1]);
    expect(readTourState()).toEqual({ tourId: "contact", index: 0 });
  });

  it("passo já concluído ('Revisar') NÃO liga o tour", async () => {
    render(
      <TourProvider>
        <SetupGuide setup={status} />
      </TourProvider>,
    );

    await userEvent.click(screen.getByRole("link", { name: /revisar/i }));
    expect(readTourState()).toBeNull();
  });

  it("sem TourProvider o guia continua funcionando (o clique só navega)", async () => {
    render(<SetupGuide setup={status} />);
    await userEvent.click(screen.getAllByRole("link", { name: /configurar agora/i })[0]);
    expect(readTourState()).toBeNull();
  });
});

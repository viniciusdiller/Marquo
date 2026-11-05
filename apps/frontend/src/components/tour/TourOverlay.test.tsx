import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TenantSetupStepId } from "@marquo/shared-types";

let mockPath = "/dashboard/servicos";
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => mockPath, useRouter: () => ({ push }) }));

import { TourOverlay } from "./TourOverlay";

const RECT = { top: 200, left: 300, width: 240, height: 60 };
let anchors: HTMLElement[] = [];

// jsdom não tem layout: cria o elemento âncora e devolve a posição combinada.
function addAnchor(target: string, rect = RECT, tag: keyof HTMLElementTagNameMap = "div") {
  const el = document.createElement(tag);
  el.setAttribute("data-tour", target);
  el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
  document.body.appendChild(el);
  anchors.push(el);
  return el;
}

function setup(tourId: TenantSetupStepId, index: number) {
  const handlers = { onGoTo: vi.fn(), onStop: vi.fn(), onStart: vi.fn() };
  render(<TourOverlay active={{ tourId, index }} {...handlers} />);
  return handlers;
}

describe("TourOverlay", () => {
  beforeEach(() => {
    mockPath = "/dashboard/servicos";
    push.mockReset();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  });
  afterEach(() => {
    anchors.forEach((el) => el.remove());
    anchors = [];
    vi.restoreAllMocks();
  });

  it("sem tour ativo não mostra nada", () => {
    const { container } = render(<TourOverlay active={null} onGoTo={vi.fn()} onStop={vi.fn()} onStart={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra o balão do ponto: título, explicação, o que fazer e em que passo está", async () => {
    addAnchor("service-name");
    setup("services", 1);

    const dialog = await screen.findByRole("dialog", { name: "Dê um nome ao serviço" });
    expect(dialog).toHaveTextContent(/aparece na sua página de agendamento/i);
    expect(dialog).toHaveTextContent("Digite o nome do serviço");
    expect(dialog).toHaveTextContent("2/5");
    expect(screen.getByLabelText("Passo 2 de 5")).toBeInTheDocument();
  });

  it("rola até o elemento e ilumina exatamente a área dele (com folga)", async () => {
    const el = addAnchor("service-name");
    setup("services", 1);
    await screen.findByRole("dialog");

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(el.isConnected).toBe(true);
    const ring = document.body.querySelector<HTMLElement>("[class*='ring-accent-500']")!;
    // O escurecimento é a sombra de um retângulo SEPARADO do anel (a animação do anel sobrescreveria a sombra).
    const dimmer = document.body.querySelector<HTMLElement>("[style*='100vmax']")!;
    expect(dimmer).not.toBe(ring);
    expect(dimmer.style.top).toBe(ring.style.top);
    expect(ring.style.boxShadow).toBe("");
    expect(ring.style.top).toBe(`${RECT.top - 8}px`);
    expect(ring.style.left).toBe(`${RECT.left - 8}px`);
    expect(ring.style.width).toBe(`${RECT.width + 16}px`);
    expect(ring.style.height).toBe(`${RECT.height + 16}px`);
  });

  it("Próximo avança e Voltar retrocede (o primeiro ponto não tem Voltar)", async () => {
    addAnchor("service-form-intro");
    const handlers = setup("services", 0);
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Voltar" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /próximo/i }));
    expect(handlers.onGoTo).toHaveBeenCalledWith(1);
  });

  it("Voltar numa tela já aberta só muda o ponto", async () => {
    addAnchor("service-duration");
    const handlers = setup("services", 2);
    await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(handlers.onGoTo).toHaveBeenCalledWith(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("o último ponto termina com 'Entendi' (fecha o tour, sem navegar)", async () => {
    addAnchor("service-submit");
    const handlers = setup("services", 4);
    await userEvent.click(await screen.findByRole("button", { name: "Entendi" }));
    expect(handlers.onStop).toHaveBeenCalled();
    expect(handlers.onGoTo).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("sai do tour pelo 'Pular tour', pelo X e pelo Esc", async () => {
    addAnchor("service-name");
    const handlers = setup("services", 1);
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Pular tour" }));
    await userEvent.click(screen.getByRole("button", { name: "Fechar tour" }));
    await userEvent.keyboard("{Escape}");
    expect(handlers.onStop).toHaveBeenCalledTimes(3);
  });

  it("as setas do teclado NÃO mexem no tour (a pessoa pode estar digitando no campo destacado)", async () => {
    addAnchor("service-name", RECT, "div");
    const handlers = setup("services", 1);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
    expect(handlers.onGoTo).not.toHaveBeenCalled();
    expect(handlers.onStop).not.toHaveBeenCalled();
  });

  it("ponto que avança no clique: sem 'Próximo', e clicar no destaque avança sem impedir o clique", async () => {
    mockPath = "/dashboard/profissionais";
    const manage = addAnchor("professional-manage", RECT, "button");
    const onClick = vi.fn();
    manage.addEventListener("click", onClick);
    const handlers = setup("working_hours", 0);

    await screen.findByRole("dialog", { name: "Abra a ficha do profissional" });
    expect(screen.queryByRole("button", { name: /próximo/i })).not.toBeInTheDocument();
    expect(screen.getByText(/clique no destaque para continuar/i)).toBeInTheDocument();

    await userEvent.click(manage);
    expect(handlers.onGoTo).toHaveBeenCalledWith(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("elemento que não aparece (ex.: ainda não há profissional): explica e leva ao passo certo", async () => {
    mockPath = "/dashboard/profissionais";
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const handlers = setup("working_hours", 0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    now = 5000;
    const dialog = await screen.findByRole("dialog", { name: "Cadastre um profissional primeiro" });
    expect(dialog).toHaveTextContent(/horários e os serviços pertencem a um profissional/i);

    await userEvent.click(screen.getByRole("button", { name: /ir para o passo 2/i }));
    expect(handlers.onStart).toHaveBeenCalledWith("professionals");
    expect(push).toHaveBeenCalledWith("/dashboard/profissionais");
  });

  it("enquanto o elemento ainda não apareceu (dentro do prazo), não mostra balão nenhum", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    setup("services", 1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saiu da tela do passo: mostra 'Tour em andamento' e Continuar leva de volta", async () => {
    mockPath = "/dashboard/agenda";
    const handlers = setup("services", 3);

    expect(screen.getByRole("status")).toHaveTextContent(/tour em andamento/i);
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(handlers.onGoTo).toHaveBeenCalledWith(3);
    expect(push).toHaveBeenCalledWith("/dashboard/servicos");
  });

  it("saiu no meio da ficha do profissional: Continuar volta para a lista, no ponto do 'Gerenciar'", async () => {
    mockPath = "/dashboard/agenda";
    const handlers = setup("working_hours", 1);
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(handlers.onGoTo).toHaveBeenCalledWith(0);
    expect(push).toHaveBeenCalledWith("/dashboard/profissionais");
  });

  it("'Sair do tour' do aviso encerra o tour", async () => {
    mockPath = "/dashboard/agenda";
    const handlers = setup("services", 0);
    await userEvent.click(screen.getByRole("button", { name: "Sair do tour" }));
    expect(handlers.onStop).toHaveBeenCalled();
  });

  it("Voltar de uma tela para a anterior também navega até ela", async () => {
    mockPath = "/dashboard/profissionais/3f2b8f0e-0000-4000-8000-000000000001";
    addAnchor("working-hours");
    const handlers = setup("working_hours", 1);
    await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(handlers.onGoTo).toHaveBeenCalledWith(0);
    expect(push).toHaveBeenCalledWith("/dashboard/profissionais");
  });

  it("no celular, com o elemento na metade de baixo, a folha vai para o TOPO (senão cobriria o destaque)", async () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    addAnchor("service-submit", { top: 640, left: 16, width: 200, height: 48 });
    setup("services", 4);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.style.top).toBe("12px"));
    expect(dialog.style.bottom).toBe("");
  });

  it("no celular o balão vira uma folha no rodapé", async () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    addAnchor("service-name", { top: 150, left: 16, width: 340, height: 70 });
    setup("services", 1);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.style.bottom).toBe("12px"));
    expect(dialog.style.left).toBe("12px");
    expect(dialog.style.right).toBe("12px");
  });
});

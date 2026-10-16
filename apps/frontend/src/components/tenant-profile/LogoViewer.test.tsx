import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogoViewer } from "./LogoViewer";

// O jsdom não faz layout, então a animação de saída com layoutId (motion) nunca termina e o diálogo nunca "sai". O
// que se testa aqui é o COMPORTAMENTO (abrir, mostrar inteira, fechar); a animação foi conferida no navegador real.
vi.mock("motion/react", () => {
  const MOTION_ONLY = new Set(["layoutId", "initial", "animate", "exit", "transition", "whileHover", "whileTap"]);
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_ONLY.has(key)));
  const motion = new Proxy(
    {},
    { get: (_t, tag: string) => (props: Record<string, unknown>) => createElement(tag, strip(props)) },
  );
  return { motion, AnimatePresence: ({ children }: { children: ReactNode }) => children, useReducedMotion: () => true };
});

const SRC = "/uploads/tenants/t/logo.webp?v=2026";

describe("LogoViewer", () => {
  it("mostra a logo recortada como botão acessível com o nome do negócio", () => {
    render(<LogoViewer src={SRC} name="Del Bianco Barbearia" />);
    expect(screen.getByRole("button", { name: /Ver a logo de Del Bianco Barbearia em tamanho grande/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Logo de Del Bianco Barbearia" }).getAttribute("src")).toMatch(/logo\.webp\?v=2026$/);
  });

  it("clicar abre a janela com a imagem inteira; Esc fecha", async () => {
    const user = userEvent.setup();
    render(<LogoViewer src={SRC} name="Del Bianco Barbearia" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /em tamanho grande/ }));
    const dialog = await screen.findByRole("dialog", { name: "Logo de Del Bianco Barbearia" });
    // A cópia ampliada usa a MESMA imagem e sem o recorte do quadradinho (object-contain, não object-cover).
    const big = dialog.querySelector("img") as HTMLImageElement;
    expect(big.getAttribute("src")).toMatch(/logo\.webp\?v=2026$/);
    expect(big.className).toContain("object-contain");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("o botão de fechar da janela também fecha", async () => {
    const user = userEvent.setup();
    render(<LogoViewer src={SRC} name="Del Bianco Barbearia" />);
    await user.click(screen.getByRole("button", { name: /em tamanho grande/ }));
    await user.click(await screen.findByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

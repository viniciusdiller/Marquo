import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WhatsAppButton } from "./WhatsAppButton";

describe("WhatsAppButton", () => {
  it("aponta para o wa.me do cliente (55 + DDD + número) e abre em aba nova sem vazar o opener", () => {
    render(<WhatsAppButton phone="11987654321" name="Ana" />);
    const link = screen.getByRole("link", { name: /chamar ana no whatsapp/i });
    expect(link).toHaveAttribute("href", "https://wa.me/5511987654321");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("aceita o telefone formatado ou com DDI (normaliza antes de montar o link)", () => {
    render(<WhatsAppButton phone="(11) 98765-4321" name="Ana" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://wa.me/5511987654321");
  });

  it("com label mostra o texto ao lado do ícone", () => {
    render(<WhatsAppButton phone="11987654321" name="Ana" label="WhatsApp" />);
    expect(screen.getByRole("link")).toHaveTextContent("WhatsApp");
  });

  it.each([undefined, null, "", "123", "00987654321", "abc"])("telefone inválido (%s): não renderiza botão nenhum", (phone) => {
    const { container } = render(<WhatsAppButton phone={phone} name="Ana" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nunca leva o texto da mensagem no link: o dono escreve no próprio WhatsApp", () => {
    render(<WhatsAppButton phone="11987654321" name="Ana" />);
    expect(screen.getByRole("link").getAttribute("href")).not.toContain("text=");
  });
});

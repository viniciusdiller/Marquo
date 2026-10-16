import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, initials } from "./Avatar";

describe("initials", () => {
  it("primeira e última letra do nome", () => {
    expect(initials("Del Bianco")).toBe("DB");
    expect(initials("  maria  ")).toBe("M");
    expect(initials("Ana Clara Souza")).toBe("AS");
  });
});

describe("Avatar", () => {
  it("com foto do backend: mostra a imagem quadrada com o nome no alt", () => {
    render(<Avatar name="Del Bianco" photoUrl="/uploads/tenants/t/professionals/p-1.webp" size={56} />);
    const img = screen.getByRole("img", { name: "Foto de Del Bianco" });
    expect(img.getAttribute("src")).toMatch(/\/uploads\/tenants\/t\/professionals\/p-1\.webp$/);
    expect(img).toHaveAttribute("width", "56");
  });

  it("sem foto: iniciais", () => {
    render(<Avatar name="Del Bianco" photoUrl={null} />);
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // O caminho vem do backend, mas a tela não confia: qualquer coisa fora de /uploads/ vira iniciais, nunca um <img>
  // apontando para outro host (rastreamento/conteúdo externo).
  it.each(["https://evil.example/x.png", "//evil.example/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "uploads/x.webp"])(
    "ignora a foto %s",
    (url) => {
      render(<Avatar name="Del Bianco" photoUrl={url} />);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByText("DB")).toBeInTheDocument();
    },
  );
});

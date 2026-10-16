import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLinks } from "./TenantSectionNav";

const ITEMS = [
  { id: "servicos", label: "Serviços" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "contato", label: "Informações" },
];

describe("SectionLinks", () => {
  it("um atalho (âncora) para cada seção que existe, na ordem recebida", () => {
    render(<SectionLinks items={ITEMS} active={null} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Serviços", "Avaliações", "Informações"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#servicos", "#avaliacoes", "#contato"]);
    expect(screen.getByRole("navigation", { name: "Seções da página" })).toBeInTheDocument();
  });

  it("destaca (aria-current) só a seção ativa", () => {
    render(<SectionLinks items={ITEMS} active="avaliacoes" />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "location");
    expect(current.map((l) => l.textContent)).toEqual(["Avaliações"]);
  });

  // Uma página com uma única seção não precisa de menu: seria uma barra com um item só.
  it("não aparece com menos de duas seções", () => {
    const { container } = render(<SectionLinks items={[ITEMS[0]]} active={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

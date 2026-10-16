import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PublicTenant } from "@marquo/shared-types";
import { TenantProfileHeader } from "./TenantProfileHeader";

// A barra do topo usa hooks de scroll/sessão que não importam aqui: o que se testa é o cartão preto "Agende online".
vi.mock("./TenantTopBar", () => ({ TenantTopBar: () => null }));
vi.mock("./LogoViewer", () => ({ LogoViewer: () => null }));
vi.mock("../ui/Reveal", () => ({ Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../brand/BrandPattern", () => ({ BrandPattern: () => null }));

const base: PublicTenant = {
  id: "t",
  name: "Del Bianco Barbearia",
  slug: "del-bianco-barbearia",
  description: null,
  address: "Rua Coronel Madureira - Centro, Saquarema - RJ",
  businessHours: "Seg a Sáb, 9h às 19h",
  logoUrl: null,
  updatedAt: "2026-10-16T00:00:00Z",
  accentColor: null,
  whatsappNumber: "5522988887777",
  instagramUrl: "https://instagram.com/delbianco",
  showServices: true,
  showTeam: true,
  showGallery: true,
  showContact: true,
  galleryImages: [],
};

function renderHeader(over: Partial<PublicTenant> = {}) {
  render(
    <TenantProfileHeader
      tenant={{ ...base, ...over }}
      rating={null}
      categories={[]}
      session={null}
      servicesCount={4}
      teamCount={1}
    />,
  );
  return within(screen.getByRole("complementary"));
}

describe("TenantProfileHeader: localização e contato no cartão preto", () => {
  it("mostra endereço com 'Como chegar', horário, WhatsApp e Instagram", () => {
    const card = renderHeader();
    expect(card.getByText("Localização e contato")).toBeInTheDocument();
    expect(card.getByText(base.address as string)).toBeInTheDocument();
    expect(card.getByText("Seg a Sáb, 9h às 19h")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /Como chegar/ })).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps/search/?api=1&query=Rua%20Coronel%20Madureira"),
    );
    expect(card.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/5522988887777");
    expect(card.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://instagram.com/delbianco");
  });

  // O dono desligou "mostrar contato": nada de contato/localização no cartão (antes o WhatsApp aparecia mesmo assim).
  it("mostra o mapa do endereço dentro do cartão", () => {
    renderHeader();
    const map = screen.getByTitle("Mapa de Del Bianco Barbearia");
    expect(map.getAttribute("src")).toContain("google.com/maps?q=Rua%20Coronel%20Madureira");
    expect(map.getAttribute("src")).toContain("output=embed");
    expect(within(screen.getByRole("complementary")).getByTitle("Mapa de Del Bianco Barbearia")).toBe(map);
  });

  it("sem endereço não há mapa", () => {
    renderHeader({ address: null });
    expect(screen.queryByTitle(/Mapa de/)).not.toBeInTheDocument();
  });

  it("respeita 'mostrar contato' desligado: some tudo", () => {
    const card = renderHeader({ showContact: false });
    expect(card.queryByText("Localização e contato")).not.toBeInTheDocument();
    expect(card.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(card.queryByRole("link", { name: /Instagram/ })).not.toBeInTheDocument();
    expect(card.queryByRole("link", { name: /Como chegar/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Mapa de/)).not.toBeInTheDocument();
    // O resto do cartão continua.
    expect(card.getByRole("link", { name: /Escolher serviço/ })).toBeInTheDocument();
  });

  it("só mostra o que o negócio preencheu (sem horário, sem linha de horário)", () => {
    const card = renderHeader({ businessHours: null, instagramUrl: null });
    expect(card.queryByText(/Seg a Sáb/)).not.toBeInTheDocument();
    expect(card.queryByRole("link", { name: /Instagram/ })).not.toBeInTheDocument();
    expect(card.getByRole("link", { name: /WhatsApp/ })).toBeInTheDocument();
  });

  it("sem nenhum dado de contato, o bloco inteiro não aparece", () => {
    const card = renderHeader({ address: null, businessHours: null, whatsappNumber: null, instagramUrl: null });
    expect(card.queryByText("Localização e contato")).not.toBeInTheDocument();
  });
});

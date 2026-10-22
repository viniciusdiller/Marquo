import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TenantProfileSettingsForm } from "./TenantProfileSettingsForm";

vi.mock("./actions", () => ({
  updateTenantProfileAction: vi.fn(),
  uploadLogoAction: vi.fn(),
  removeLogoAction: vi.fn(),
}));

const tenant = {
  name: "Salão Teste",
  slug: "salao-teste",
  description: null,
  address: null,
  businessHours: null,
  logoUrl: null,
  updatedAt: "2026-10-22T00:00:00.000Z",
  accentColor: null,
  whatsappNumber: null,
  instagramUrl: null,
  showServices: true,
  showTeam: true,
  showGallery: true,
  showContact: true,
  minSchedulingLeadTimeMinutes: 120,
  maxSchedulingLeadTimeDays: 60,
  notifyStaffByEmail: true,
};

const toggle = () => screen.getByRole("checkbox", { name: /avisar a equipe/i });

describe("TenantProfileSettingsForm: avisos por e-mail", () => {
  it("vem marcado quando o negócio recebe os avisos (padrão)", () => {
    render(<TenantProfileSettingsForm tenant={tenant} />);
    expect(toggle()).toBeChecked();
    expect(toggle()).toHaveAttribute("name", "notifyStaffByEmail");
  });

  it("vem desmarcado quando o dono já desligou", () => {
    render(<TenantProfileSettingsForm tenant={{ ...tenant, notifyStaffByEmail: false }} />);
    expect(toggle()).not.toBeChecked();
  });

  it("explica que o que o cliente recebe não muda", () => {
    render(<TenantProfileSettingsForm tenant={tenant} />);
    expect(screen.getByText(/o que o cliente recebe/i)).toBeInTheDocument();
  });
});

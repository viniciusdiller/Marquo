import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./SignupForm", () => ({ SignupForm: () => <div>formulário da conta</div> }));

import { SignupFlow } from "./SignupFlow";
import type { PlanInfo } from "@/lib/billing";

const PLANS: PlanInfo[] = [
  { tier: "ESSENCIAL", name: "Essencial", priceCents: 4990, maxProfessionals: 2 },
  { tier: "PROFISSIONAL", name: "Profissional", priceCents: 9990, maxProfessionals: 5 },
  { tier: "PREMIUM", name: "Premium", priceCents: 18990, maxProfessionals: null },
];

const card = (name: string) => screen.getByRole("radio", { name: new RegExp(name) });

describe("SignupFlow: o clube não entra nos 14 dias grátis", () => {
  it("avisa em destaque, antes de escolher o plano, que o clube fica fora do teste", () => {
    render(<SignupFlow plans={PLANS} initialTier={null} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/Atenção/);
    expect(note).toHaveTextContent(/clube de assinaturas não entra nos 14 dias grátis/);
    expect(note).toHaveTextContent(/assina o Profissional ou o Premium/);
  });

  it("Profissional e Premium mostram o clube com a etiqueta 'Só depois de assinar'; o Essencial nem lista o clube", () => {
    render(<SignupFlow plans={PLANS} initialTier={null} />);
    for (const name of ["Profissional", "Premium"]) {
      const c = within(card(name));
      expect(c.getByText(/Clube de assinaturas/)).toBeInTheDocument();
      expect(c.getByText(/Só depois de assinar/)).toHaveTextContent(/não entra nos 14 dias grátis/);
    }
    const essencial = within(card("Essencial"));
    expect(essencial.queryByText(/Clube de assinaturas/)).not.toBeInTheDocument();
    expect(essencial.queryByText(/Só depois de assinar/)).not.toBeInTheDocument();
  });

  it("na etapa da conta, a linha do tempo repete que o clube só vem depois de assinar", async () => {
    const user = userEvent.setup();
    render(<SignupFlow plans={PLANS} initialTier={null} />);
    await user.click(card("Profissional"));
    await user.click(screen.getByRole("button", { name: /Continuar com o Profissional/ }));
    expect(screen.getByText(/O clube de assinaturas só é liberado depois de assinar o Profissional ou o Premium/)).toBeInTheDocument();
  });
});

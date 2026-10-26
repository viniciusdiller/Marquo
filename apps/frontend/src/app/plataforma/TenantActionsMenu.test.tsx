import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const purgeTenantDataAction = vi.fn();
vi.mock("./actions", () => ({
  extendTrialAction: vi.fn(),
  grantCourtesyAction: vi.fn(),
  passwordResetLinkAction: vi.fn(),
  purgeTenantDataAction: (...args: unknown[]) => purgeTenantDataAction(...args),
  reactivateTenantAction: vi.fn(),
  removeCourtesyAction: vi.fn(),
  suspendTenantAction: vi.fn(),
  updateOwnerPhoneAction: vi.fn(),
}));

import { TenantActionsMenu } from "./TenantActionsMenu";

const ID = "3f2b8f0e-0000-4000-8000-000000000001";
const props = {
  tenantId: ID,
  tenantName: "Salão da Ana",
  tenantSlug: "salao-da-ana",
  suspended: false,
  hasSubscription: false,
  courtesy: false,
  hasActiveOwner: true,
  ownerPhone: null,
};

async function openDeleteDialog() {
  render(<TenantActionsMenu {...props} />);
  await userEvent.click(screen.getByRole("button", { name: /ações de salão da ana/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /excluir negócio/i }));
}
const confirm = () => screen.getByRole("button", { name: /excluir definitivamente/i });

describe("TenantActionsMenu: excluir negócio", () => {
  beforeEach(() => {
    purgeTenantDataAction.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  it("o menu da lista de negócios tem 'Excluir negócio' e nada é enviado ao abrir", async () => {
    await openDeleteDialog();
    expect(screen.getByRole("dialog", { name: /excluir salão da ana/i })).toBeInTheDocument();
    expect(purgeTenantDataAction).not.toHaveBeenCalled();
  });

  it("travado até digitar o endereço exato e marcar a ciência; motivo é opcional", async () => {
    await openDeleteDialog();
    expect(confirm()).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-da-ana");
    expect(confirm()).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(confirm()).toBeEnabled();
  });

  it("endereço diferente mantém travado (inclusive maiúscula)", async () => {
    await openDeleteDialog();
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "Salao-da-Ana");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(confirm()).toBeDisabled();
  });

  it("confirma: exclui na hora (sem esperar prazo) e volta para a lista de negócios", async () => {
    purgeTenantDataAction.mockResolvedValue({ ok: true });
    await openDeleteDialog();
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-da-ana");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(confirm());

    await waitFor(() => expect(purgeTenantDataAction).toHaveBeenCalledWith(ID, "salao-da-ana", ""));
    expect(replace).toHaveBeenCalledWith("/plataforma/negocios");
    expect(refresh).toHaveBeenCalled();
  });

  it("erro do servidor (ex.: falha ao cancelar o cartão no provedor) aparece e nada navega", async () => {
    purgeTenantDataAction.mockResolvedValue({ ok: false, error: "Não foi possível falar com o serviço de pagamento agora." });
    await openDeleteDialog();
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-da-ana");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(confirm());

    expect(await screen.findByRole("alert")).toHaveTextContent(/serviço de pagamento/i);
    expect(replace).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const purgeTenantDataAction = vi.fn();
vi.mock("../../actions", () => ({ purgeTenantDataAction: (...args: unknown[]) => purgeTenantDataAction(...args) }));

import { DeleteTenantForm } from "./DeleteTenantForm";

const ID = "3f2b8f0e-0000-4000-8000-000000000001";
const button = () => screen.getByRole("button", { name: /excluir os dados definitivamente/i });

describe("DeleteTenantForm", () => {
  beforeEach(() => {
    purgeTenantDataAction.mockReset();
    replace.mockReset();
  });

  it("começa travado: nada de clique sem digitar o endereço e marcar a ciência", async () => {
    render(<DeleteTenantForm tenantId={ID} slug="salao-teste" />);
    expect(button()).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-teste");
    expect(button()).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(button()).toBeEnabled();
  });

  it("endereço digitado diferente do negócio mantém o botão travado (inclusive diferença de maiúscula)", async () => {
    render(<DeleteTenantForm tenantId={ID} slug="salao-teste" />);
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "Salao-Teste");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(button()).toBeDisabled();
  });

  it("o motivo é opcional: sem motivo já habilita (não há espera de 90 dias)", async () => {
    render(<DeleteTenantForm tenantId={ID} slug="salao-teste" />);
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-teste");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(button()).toBeEnabled();
  });

  it("se o motivo for informado, precisa ter ao menos 10 caracteres", async () => {
    render(<DeleteTenantForm tenantId={ID} slug="salao-teste" />);
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-teste");
    await userEvent.click(screen.getByRole("checkbox"));

    await userEvent.type(screen.getByLabelText(/motivo \(opcional\)/i), "curto");
    expect(button()).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/motivo \(opcional\)/i), " e agora sim longo");
    expect(button()).toBeEnabled();
  });

  it("confirma: chama a ação com o id, o endereço e o motivo, e volta para a lista", async () => {
    purgeTenantDataAction.mockResolvedValue({ ok: true });
    render(<DeleteTenantForm tenantId={ID} slug="salao-teste" />);
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-teste");
    await userEvent.type(screen.getByLabelText(/motivo \(opcional\)/i), "Pedido do titular em 22/10");
    await userEvent.click(screen.getByRole("checkbox"));

    await userEvent.click(button());

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/plataforma/negocios"));
    expect(purgeTenantDataAction).toHaveBeenCalledWith(ID, "salao-teste", "Pedido do titular em 22/10");
  });

  it("erro do backend aparece e o formulário continua (nada de navegar)", async () => {
    purgeTenantDataAction.mockResolvedValue({ ok: false, error: "Este negócio ainda tem acesso ao Marquo." });
    render(<DeleteTenantForm tenantId={ID} slug="salao-teste" />);
    await userEvent.type(screen.getByLabelText(/digite o endereço/i), "salao-teste");
    await userEvent.click(screen.getByRole("checkbox"));

    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(/ainda tem acesso/i);
    expect(replace).not.toHaveBeenCalled();
  });
});

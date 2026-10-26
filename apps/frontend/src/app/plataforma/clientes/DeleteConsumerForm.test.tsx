import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const deleteConsumerAction = vi.fn();
vi.mock("../actions", () => ({ deleteConsumerAction: (...args: unknown[]) => deleteConsumerAction(...args) }));

import { DeleteConsumerForm } from "./DeleteConsumerForm";

const ID = "3f2b8f0e-0000-4000-8000-0000000000c1";
const open = () => userEvent.click(screen.getByRole("button", { name: /excluir a conta de ana/i }));
const submit = () => screen.getByRole("button", { name: /excluir definitivamente/i });

async function fill(phone: string, reason = "pedido do titular em 22/10", check = true) {
  await userEvent.type(screen.getByLabelText(/digite o telefone/i), phone);
  await userEvent.type(screen.getByLabelText(/motivo/i), reason);
  if (check) await userEvent.click(screen.getByRole("checkbox"));
}

describe("DeleteConsumerForm", () => {
  beforeEach(() => {
    deleteConsumerAction.mockReset();
    refresh.mockReset();
  });

  it("começa só com o botão: nada é pedido nem enviado até abrir", () => {
    render(<DeleteConsumerForm consumerId={ID} name="Ana" phone="11987654321" />);
    expect(screen.queryByLabelText(/digite o telefone/i)).not.toBeInTheDocument();
    expect(deleteConsumerAction).not.toHaveBeenCalled();
  });

  it("só habilita com telefone certo, motivo e o aceite; aceita máscara e DDI", async () => {
    render(<DeleteConsumerForm consumerId={ID} name="Ana" phone="11987654321" />);
    await open();
    expect(submit()).toBeDisabled();

    await fill("(11) 98765-4321");
    expect(submit()).toBeEnabled();
  });

  it("telefone errado, motivo curto ou sem aceite: continua desabilitado", async () => {
    render(<DeleteConsumerForm consumerId={ID} name="Ana" phone="11987654321" />);
    await open();
    await fill("11911112222");
    expect(submit()).toBeDisabled();
  });

  it("confirma, chama a ação com telefone e motivo e atualiza a lista", async () => {
    deleteConsumerAction.mockResolvedValue({ ok: true });
    render(<DeleteConsumerForm consumerId={ID} name="Ana" phone="11987654321" />);
    await open();
    await fill("11987654321");
    await userEvent.click(submit());

    await waitFor(() => expect(deleteConsumerAction).toHaveBeenCalledWith(ID, "11987654321", "pedido do titular em 22/10"));
    expect(refresh).toHaveBeenCalled();
  });

  it("erro do servidor aparece e a lista não é atualizada", async () => {
    deleteConsumerAction.mockResolvedValue({ ok: false, error: "A confirmação não confere com o telefone da conta." });
    render(<DeleteConsumerForm consumerId={ID} name="Ana" phone="11987654321" />);
    await open();
    await fill("11987654321");
    await userEvent.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(/não confere/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancelar fecha o formulário sem enviar", async () => {
    render(<DeleteConsumerForm consumerId={ID} name="Ana" phone="11987654321" />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.queryByLabelText(/digite o telefone/i)).not.toBeInTheDocument();
    expect(deleteConsumerAction).not.toHaveBeenCalled();
  });
});

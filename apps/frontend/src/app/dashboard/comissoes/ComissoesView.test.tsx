import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommissionRule } from "@marquo/shared-types";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./actions", () => ({
  createCommissionRuleAction: actions.create,
  // bind(null, id) no componente: o mock recebe (id, prev, formData)
  updateCommissionRuleAction: actions.update,
  deleteCommissionRuleAction: actions.remove,
}));

import { ComissoesView } from "./ComissoesView";

const professionals = [
  { id: "p1", name: "Alex" },
  { id: "p2", name: "Bruna" },
];
const services = [{ id: "s1", name: "Corte" }];
const rules: CommissionRule[] = [
  { id: "r1", professionalId: "p1", base: "ALL", targetId: null, kind: "PERCENT", value: 30, isActive: true },
  { id: "r2", professionalId: "p2", base: "SERVICE", targetId: "s1", kind: "FIXED", value: 1250, isActive: false },
];

function setup() {
  return render(<ComissoesView rules={rules} professionals={professionals} services={services} products={[]} />);
}

beforeEach(() => {
  actions.create.mockReset().mockResolvedValue({});
  actions.update.mockReset().mockResolvedValue({ ok: true });
  actions.remove.mockReset().mockResolvedValue({ ok: true });
});

describe("ComissoesView: editar e excluir regras", () => {
  it("cada regra tem Editar e Excluir, e a inativa aparece marcada", () => {
    setup();
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(2);
    expect(screen.getByText("(inativa)")).toBeInTheDocument();
  });

  it("Editar abre o formulário já preenchido com os valores da regra", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Editar" })[0]);

    // A página tem também o formulário "Nova regra": a busca é restrita ao formulário de edição.
    const form = screen.getByRole("button", { name: "Salvar" }).closest("form")!;
    expect(within(form).getByLabelText("Profissional")).toHaveValue("p1");
    expect(within(form).getByLabelText("Percentual da comissão")).toHaveValue(30);
    expect(within(form).getByRole("checkbox", { name: "Ativa" })).toBeChecked();
  });

  it("editar uma regra inativa mostra 'Ativa' desmarcada e o valor fixo formatado", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Editar" })[1]);

    const form = screen.getByRole("button", { name: "Salvar" }).closest("form")!;
    expect(within(form).getByRole("checkbox", { name: "Ativa" })).not.toBeChecked();
    expect(within(form).getByLabelText("Valor fixo da comissão (R$)")).toHaveValue("12,50");
    expect(within(form).getByLabelText("Serviço")).toHaveValue("s1");
  });

  it("regra 'qualquer serviço' (sem alvo) abre com 'Qualquer serviço' e o alvo NÃO é obrigatório", async () => {
    const user = userEvent.setup();
    render(
      <ComissoesView
        rules={[{ id: "r9", professionalId: "p1", base: "SERVICE", targetId: null, kind: "PERCENT", value: 30, isActive: true }]}
        professionals={professionals}
        services={services}
        products={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const form = screen.getByRole("button", { name: "Salvar" }).closest("form")!;
    const target = within(form).getByLabelText("Serviço") as HTMLSelectElement;
    expect(target).toHaveValue("");
    expect(target).not.toBeRequired();
    expect(within(form).getByRole("option", { name: "Qualquer serviço" })).toBeInTheDocument();

    await user.click(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(actions.update).toHaveBeenCalled());
  });

  it("salvar a edição chama a action com o id da regra e fecha o formulário", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(actions.update).toHaveBeenCalled());
    expect(actions.update.mock.calls[0][0]).toBe("r1");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument());
  });

  it("erro do servidor na edição aparece e o formulário continua aberto", async () => {
    actions.update.mockResolvedValue({ error: "Já existe uma regra ativa para este profissional e este alvo." });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/Já existe uma regra ativa/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });

  it("Cancelar descarta a edição sem chamar a action", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it("Excluir pede confirmação (nada é excluído antes) e só então chama a action", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Excluir" })[0]);

    expect(await screen.findByText("Excluir esta regra de comissão?")).toBeInTheDocument();
    expect(actions.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir regra" }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("r1"));
  });

  it("Voltar na confirmação não exclui", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Excluir" })[0]);
    await user.click(await screen.findByRole("button", { name: "Voltar" }));

    expect(actions.remove).not.toHaveBeenCalled();
  });

  it("erro ao excluir fica visível dentro do diálogo", async () => {
    actions.remove.mockResolvedValue({ error: "Regra de comissão não encontrada." });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "Excluir" })[0]);
    await user.click(await screen.findByRole("button", { name: "Excluir regra" }));

    expect(await screen.findByText("Regra de comissão não encontrada.")).toBeInTheDocument();
  });
});

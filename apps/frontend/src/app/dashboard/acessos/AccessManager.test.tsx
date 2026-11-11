import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { normalizePermissions, type AccessProfileSummary } from "@marquo/shared-types";

const create = vi.fn().mockResolvedValue({});
vi.mock("./actions", () => ({
  createProfileAction: (...a: unknown[]) => create(...a),
  updateProfileAction: vi.fn().mockResolvedValue({}),
  deleteProfileAction: vi.fn().mockResolvedValue({}),
  createAccessUserAction: vi.fn().mockResolvedValue({}),
  updateAccessUserAction: vi.fn().mockResolvedValue({}),
  resetAccessPasswordAction: vi.fn().mockResolvedValue({}),
}));

import { AccessManager, summarize } from "./AccessManager";

const profile: AccessProfileSummary = {
  id: "p1", name: "Recepção", description: null, usersCount: 2,
  permissions: normalizePermissions({ agenda: "EDIT", caixa: "VIEW" }),
};

describe("summarize", () => {
  it("resume quantas áreas edita e só vê", () => {
    expect(summarize(profile.permissions)).toBe("edita 1 · só vê 1");
    expect(summarize(normalizePermissions({}))).toBe("Nenhum acesso");
  });
});

describe("AccessManager", () => {
  it("lista perfis com a contagem de pessoas", () => {
    render(<AccessManager profiles={[profile]} users={[]} />);
    expect(screen.getByText(/2 pessoas/)).toBeInTheDocument();
  });

  it("novo perfil: sem nome o botão fica desabilitado e a matriz envia o nível escolhido", async () => {
    const user = userEvent.setup();
    render(<AccessManager profiles={[profile]} users={[]} />);
    await user.click(screen.getByRole("button", { name: "Novo perfil" }));
    const save = screen.getByRole("button", { name: "Criar perfil" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Nome do perfil"), "Caixa");
    const caixa = screen.getByRole("radiogroup", { name: "Caixa" });
    await user.click(within(caixa).getByRole("radio", { name: "Ver e editar" }));
    await user.click(save);
    const input = create.mock.calls[0][0];
    expect(input.name).toBe("Caixa");
    expect(input.permissions.caixa).toBe("EDIT");
    expect(input.permissions.financeiro).toBe("NONE");
  });
});

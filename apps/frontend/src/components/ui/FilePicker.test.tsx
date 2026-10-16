import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilePicker } from "./FilePicker";

const png = (name = "logo.png") => new File(["x"], name, { type: "image/png" });

function setup(props: Partial<React.ComponentProps<typeof FilePicker>> = {}) {
  const onSelectionChange = vi.fn();
  const utils = render(
    <form data-testid="form">
      <FilePicker accept="image/png" onSelectionChange={onSelectionChange} {...props} />
    </form>,
  );
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...utils, input, onSelectionChange };
}

describe("FilePicker", () => {
  it("é um botão de verdade que abre o seletor de arquivos (não só o texto)", async () => {
    const user = userEvent.setup();
    const { input } = setup();
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: /Anexar imagem/ }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("mantém o <input name=file> dentro do formulário, para o arquivo ir no FormData", () => {
    const { input, getByTestId } = setup({ name: "file" });
    expect(getByTestId("form")).toContainElement(input);
    expect(input).toHaveAttribute("name", "file");
    expect(input).toHaveAttribute("accept", "image/png");
  });

  it("começa sem arquivo e mostra o texto próprio (não o do navegador)", () => {
    setup();
    expect(screen.getByText("Nenhuma imagem anexada")).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum arquivo escolhido/)).not.toBeInTheDocument();
  });

  it("ao escolher: mostra o nome, troca o rótulo do botão e avisa que há arquivo", async () => {
    const user = userEvent.setup();
    const { input, onSelectionChange } = setup();
    await user.upload(input, png("fachada.png"));
    expect(await screen.findByText("fachada.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trocar imagem/ })).toBeInTheDocument();
    expect(onSelectionChange).toHaveBeenLastCalledWith("fachada.png");
  });

  it("deixa quem chama tratar o arquivo antes (ex.: comprimir) e mostra o nome do resultado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async (event: React.ChangeEvent<HTMLInputElement>) => {
      // O jsdom não tem DataTransfer: simula o que o navegador faz ao trocar a lista de arquivos do input.
      Object.defineProperty(event.target, "files", { value: [png("comprimida.png")], configurable: true });
    });
    const { input } = setup({ onChange });
    await user.upload(input, png("original.png"));
    expect(await screen.findByText("comprimida.png")).toBeInTheDocument();
  });

  it("depois que o formulário é reiniciado (envio concluído), volta a 'nenhuma imagem'", async () => {
    const user = userEvent.setup();
    const { input, getByTestId, onSelectionChange } = setup();
    await user.upload(input, png("a.png"));
    await screen.findByText("a.png");
    fireEvent.reset(getByTestId("form"));
    await waitFor(() => expect(screen.getByText("Nenhuma imagem anexada")).toBeInTheDocument());
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it("desabilitado: o botão não abre o seletor", async () => {
    const user = userEvent.setup();
    const { input } = setup({ disabled: true });
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: /Anexar imagem/ }));
    expect(click).not.toHaveBeenCalled();
  });
});

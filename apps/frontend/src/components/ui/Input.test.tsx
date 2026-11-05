import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

const caps = (on: boolean) => ({ key: "a", modifierCapsLock: on });

describe("Input — aviso de Caps Lock", () => {
  it("mostra o aviso na senha quando o Caps Lock está ligado e some ao desligar", () => {
    render(<Input label="Senha" name="password" type="password" />);
    const field = screen.getByLabelText("Senha");
    fireEvent.keyDown(field, caps(true));
    expect(screen.getByRole("status").textContent).toContain("Caps Lock");
    fireEvent.keyUp(field, caps(false));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("some ao sair do campo", () => {
    render(<Input label="Senha" name="password" type="password" />);
    const field = screen.getByLabelText("Senha");
    fireEvent.keyDown(field, caps(true));
    fireEvent.blur(field);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("não avisa em campo que não é senha", () => {
    render(<Input label="Nome" name="name" />);
    fireEvent.keyDown(screen.getByLabelText("Nome"), caps(true));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("continua chamando os handlers de quem usa o componente", () => {
    const onKeyDown = vi.fn();
    const onBlur = vi.fn();
    render(<Input label="Senha" name="password" type="password" onKeyDown={onKeyDown} onBlur={onBlur} />);
    const field = screen.getByLabelText("Senha");
    fireEvent.keyDown(field, caps(false));
    fireEvent.blur(field);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

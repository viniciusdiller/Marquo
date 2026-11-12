"use client";

import { type ComponentPropsWithoutRef, forwardRef, useState } from "react";
import { Input } from "./Input";
import { formatCep, formatCPF, formatCpfCnpj, formatMoneyInput, formatPhoneBR } from "@/lib/masks";

const FORMATTERS = {
  phone: formatPhoneBR,
  cpf: formatCPF,
  cpfCnpj: formatCpfCnpj,
  cep: formatCep,
  // Dinheiro em reais: os dígitos entram pela direita ("4590" → "45,90"). O valor submetido é o
  // texto formatado ("1.234,56"); a Server Action converte para centavos com `moneyToCents`.
  money: formatMoneyInput,
} as const;

// Só teclado numérico nos campos que são só números (no celular abre o teclado certo).
const INPUT_MODE = { phone: "numeric", cpf: "numeric", cpfCnpj: "numeric", cep: "numeric", money: "numeric" } as const;

const AUTOCOMPLETE = { phone: "tel-national", cpf: undefined, cpfCnpj: "off", cep: "postal-code", money: "off" } as const;

interface MaskedInputProps extends Omit<ComponentPropsWithoutRef<typeof Input>, "onChange"> {
  mask: keyof typeof FORMATTERS;
  onChange?: (value: string) => void;
}

// Formata só a exibição, digitando. O backend REVALIDA e normaliza tudo (telefone/CPF viram
// dígitos, dinheiro vira centavos) — a máscara é conforto, não segurança.
export const MaskedInput = forwardRef<HTMLInputElement, MaskedInputProps>(function MaskedInput(
  { mask, defaultValue, value: controlledValue, onChange, ...props },
  ref,
) {
  const format = FORMATTERS[mask];
  const [value, setValue] = useState(() => format(String(controlledValue ?? defaultValue ?? "")));

  return (
    <Input
      ref={ref}
      inputMode={INPUT_MODE[mask]}
      autoComplete={AUTOCOMPLETE[mask]}
      {...props}
      value={controlledValue !== undefined ? format(String(controlledValue)) : value}
      onChange={(e) => {
        let formatted = format(e.target.value);
        // Dinheiro em "0,00" + Backspace/Delete: sem isto o campo nunca esvazia (apagar um dígito de
        // "0,0" volta a "0,00"), o que impede limpar um campo opcional.
        const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
        if (mask === "money" && inputType.startsWith("delete") && formatted === "0,00") formatted = "";
        if (controlledValue === undefined) setValue(formatted);
        onChange?.(formatted);
      }}
    />
  );
});

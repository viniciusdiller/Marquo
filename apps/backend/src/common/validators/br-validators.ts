import { ValidationOptions, registerDecorator } from "class-validator";
import { isValidCnpj } from "../utils/cnpj.util";
import { isValidCpf } from "../utils/cpf.util";
import { isPlausibleBrazilianPhone, normalizePhone } from "../utils/phone.util";

function decorate(
  name: string,
  test: (value: unknown) => boolean,
  defaultMessage: string,
  options?: ValidationOptions,
) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options: { message: defaultMessage, ...options },
      validator: { validate: test },
    });
}

// Telefone nacional em qualquer formato de digitação ("(11) 91234-5678", "+55 11 91234-5678").
// O serviço normaliza para dígitos de qualquer jeito; isto só recusa lixo na borda, com 400.
export const IsBrazilianPhone = (options?: ValidationOptions) =>
  decorate(
    "isBrazilianPhone",
    (v) => typeof v === "string" && v.length <= 25 && isPlausibleBrazilianPhone(normalizePhone(v)),
    "Telefone inválido. Informe DDD e número.",
    options,
  );

export const IsCpf = (options?: ValidationOptions) =>
  decorate("isCpf", (v) => typeof v === "string" && v.length <= 20 && isValidCpf(v), "CPF inválido.", options);

// Documento do pagador da cobrança: CPF (pessoa física) ou CNPJ (MEI/empresa), com ou sem máscara.
export const IsCpfOrCnpj = (options?: ValidationOptions) =>
  decorate(
    "isCpfOrCnpj",
    (v) => typeof v === "string" && v.length <= 20 && (isValidCpf(v) || isValidCnpj(v)),
    "CPF ou CNPJ inválido.",
    options,
  );

// Data de nascimento: data real, não no futuro e não anterior a 1900 (IsDateString aceitava
// "0001-01-01" e "9999-12-31").
export const IsBirthDate = (options?: ValidationOptions) =>
  decorate(
    "isBirthDate",
    (v) => {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return false;
      const date = new Date(v);
      return !Number.isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getTime() <= Date.now();
    },
    "Data de nascimento inválida.",
    options,
  );

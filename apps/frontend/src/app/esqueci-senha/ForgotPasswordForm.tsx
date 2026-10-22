"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialState);

  if (state?.sent) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600 dark:text-stone-300">
          Se o e-mail informado estiver cadastrado, enviamos um link para redefinir a senha. Ele vale por 1 hora.
        </p>
        <p className="text-sm text-zinc-500 dark:text-stone-400">
          Não chegou? Veja a caixa de spam. Se continuar sem receber, fale com o suporte: suporte@marquo.com.br.
        </p>
        <Button href="/entrar" className="w-full">
          Voltar ao login
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Input label="E-mail da conta" name="email" type="email" autoComplete="email" required maxLength={254} />

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2 w-full disabled:opacity-60">
        {pending ? "Enviando..." : "Enviar link"}
      </Button>
    </form>
  );
}

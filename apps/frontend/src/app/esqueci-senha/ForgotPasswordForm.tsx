"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  forgotPasswordAction,
  resetConsumerPasswordAction,
  type ForgotPasswordState,
  type ResetConsumerPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = {};
const resetInitialState: ResetConsumerPasswordState = {};

// Passo 2 (conta de cliente): o código que chegou por e-mail + a nova senha.
function ConsumerCodeForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resetConsumerPasswordAction, resetInitialState);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Recebeu um código de 6 dígitos?</p>
      <input type="hidden" name="email" value={email} />
      <Input
        label="Código"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
      />
      <Input label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      <Input
        label="Confirmar nova senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full disabled:opacity-60">
        {pending ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialState);

  if (state?.sent && state.email) {
    return (
      <div className="flex flex-col gap-5">
        <div role="status" className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-stone-300">
          <p>Se o e-mail informado estiver cadastrado, enviamos as instruções para ele:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Conta do negócio</strong> (dono ou equipe): um <strong>link</strong> para criar a nova senha, válido por 1 hora.
            </li>
            <li>
              <strong>Conta de cliente</strong>: um <strong>código de 6 dígitos</strong>, válido por 10 minutos. Digite abaixo.
            </li>
          </ul>
        </div>

        <ConsumerCodeForm email={state.email} />

        <p className="text-sm text-zinc-500 dark:text-stone-400">
          Não chegou? Veja a caixa de spam. Se continuar sem receber, fale com o suporte: suporte@marquo.com.br.
        </p>
        <Button href="/entrar" variant="ghost" className="w-full">
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
        {pending ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { verifyEmailAction, type VerifyEmailState } from "./actions";

const initialState: VerifyEmailState = {};

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, initialState);

  if (state?.verified) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600 dark:text-stone-300">E-mail confirmado. Agora você já pode entrar.</p>
        <Button href="/entrar" className="w-full">
          Ir para o login
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-zinc-600 dark:text-stone-300">Clique para confirmar que este e-mail é seu.</p>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full disabled:opacity-60">
        {pending ? "Confirmando..." : "Confirmar meu e-mail"}
      </Button>
    </form>
  );
}

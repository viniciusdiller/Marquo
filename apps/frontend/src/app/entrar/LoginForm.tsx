"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import { loginAction, registerAction } from "./actions";

const MIN_PASSWORD = 8;

type Mode = "login" | "register";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
  }

  function finish(result: { redirectTo: string } | { error: string }) {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.replace(result.redirectTo);
    router.refresh();
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => finish(await loginAction(identifier, password, next)));
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    if (!consent) {
      setError("É necessário aceitar os termos e a política de privacidade.");
      return;
    }
    startTransition(async () =>
      finish(await registerAction({ name, phone, email, password, consent }, next)),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold dark:bg-white/5">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={clsx(
              "rounded-lg py-2 transition-colors",
              mode === m
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 dark:text-stone-400",
            )}
          >
            {m === "login" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      {mode === "login" ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <Input
            label="E-mail ou telefone"
            name="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            maxLength={254}
          />
          <Input
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            maxLength={72}
          />

          <Link
            href="/esqueci-senha"
            className="-mt-2 self-end text-sm font-semibold text-accent-600 dark:text-accent-300"
          >
            Esqueci minha senha
          </Link>

          {error ? <p role="alert" className="animate-rise-in text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <Button type="submit" disabled={pending} className="mt-2 w-full disabled:opacity-60">
            {pending ? "Entrando..." : "Entrar"}
          </Button>

          <p className="text-center text-sm text-zinc-500 dark:text-stone-400">
            Tem um salão ou barbearia?{" "}
            <Link href="/cadastro" className="font-semibold text-accent-600 dark:text-accent-300">
              Criar conta grátis
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500 dark:text-stone-400">
            Conta de cliente: agende em qualquer salão e acompanhe seu histórico. Se você já
            agendou antes com este telefone, seus agendamentos aparecem na conta.
          </p>
          <Input
            label="Seu nome"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
          <MaskedInput
            mask="phone"
            label="Telefone"
            name="phone"
            type="tel"
            placeholder="(11) 91234-5678"
            autoComplete="tel"
            value={phone}
            onChange={setPhone}
            required
          />
          <Input
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
          <Input
            label="Crie uma senha"
            name="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            maxLength={72}
          />
          <Input
            label="Confirme a senha"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            maxLength={72}
          />
          <label className="flex items-start gap-2 text-xs text-zinc-500 dark:text-stone-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Aceito os{" "}
              <Link href="/termos" target="_blank" className="font-semibold text-accent-600 dark:text-accent-300">
                termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="font-semibold text-accent-600 dark:text-accent-300">
                política de privacidade
              </Link>
              . Meus dados serão usados só para identificar minha conta, meus agendamentos e avaliações.
            </span>
          </label>

          {error ? <p role="alert" className="animate-rise-in text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <Button type="submit" disabled={pending} className="mt-2 w-full disabled:opacity-60">
            {pending ? "Criando..." : "Criar conta"}
          </Button>
        </form>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import {
  loginAction,
  registerAction,
  requestRegisterCodeAction,
  resendVerificationAction,
  verifyPlatformCodeAction,
  type LoginResult,
} from "./actions";

const MIN_PASSWORD = 8;

type Mode = "login" | "register";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  // Conta cujo e-mail ainda não foi confirmado: o erro vem com um botão para reenviar o link.
  const [unverified, setUnverified] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  // Conta da plataforma com 2FA: depois da senha, a tela pede o código enviado por e-mail.
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  // Cadastro de cliente em duas etapas: 1) dados e pedido do código, 2) código recebido no e-mail digitado.
  const [codeSent, setCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [codeNote, setCodeNote] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setUnverified(false);
    setResendNote(null);
    setCodeSent(false);
    setEmailCode("");
    setCodeNote(null);
    setPassword("");
  }

  function finish(result: LoginResult) {
    if ("needsCode" in result) {
      setChallengeId(result.challengeId);
      setCode("");
      setPassword("");
      return;
    }
    if ("error" in result) {
      setError(result.error);
      setUnverified(result.code === "EMAIL_NOT_VERIFIED");
      setResendNote(null);
      return;
    }
    router.replace(result.redirectTo);
    router.refresh();
  }

  function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!challengeId) return;
    startTransition(async () => {
      const result = await verifyPlatformCodeAction(challengeId, code);
      if ("error" in result) {
        setError(result.error);
        if (result.restart) setCode("");
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    });
  }

  function cancelCode() {
    setChallengeId(null);
    setCode("");
    setError(null);
  }

  function handleResend() {
    setResendNote(null);
    startTransition(async () => {
      const result = await resendVerificationAction(identifier);
      setResendNote(result.ok ? "Se o e-mail estiver cadastrado, enviamos um novo link. Veja também a caixa de spam." : result.error);
    });
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setResendNote(null);
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

    startTransition(async () => {
      // Etapa 1: pede o código ao e-mail digitado (a menos que o sistema esteja sem e-mail, em desenvolvimento).
      if (!codeSent) {
        const requested = await requestRegisterCodeAction(email);
        if (!requested.ok) {
          setError(requested.error);
          return;
        }
        if (requested.required) {
          setCodeSent(true);
          setCodeNote("Enviamos um código de 6 dígitos para o seu e-mail. Veja também a caixa de spam.");
          return;
        }
      } else if (!/^\d{6}$/.test(emailCode)) {
        setError("Digite o código de 6 dígitos que enviamos para o seu e-mail.");
        return;
      }

      finish(
        await registerAction(
          { name, phone, email, password, consent, ...(codeSent ? { emailCode } : {}) },
          next,
        ),
      );
    });
  }

  function handleResendCode() {
    setError(null);
    setCodeNote(null);
    startTransition(async () => {
      const requested = await requestRegisterCodeAction(email);
      setCodeNote(
        requested.ok
          ? "Se o e-mail estiver correto, enviamos um novo código. Ele só pode ser reenviado a cada minuto."
          : requested.error,
      );
    });
  }

  function changeEmail() {
    setCodeSent(false);
    setEmailCode("");
    setCodeNote(null);
    setError(null);
  }

  if (challengeId) {
    return (
      <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600 dark:text-stone-300">
          Enviamos um código de 6 dígitos para o e-mail da conta. Digite-o abaixo para concluir o acesso.
        </p>
        <Input
          label="Código de acesso"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          maxLength={6}
        />
        {error ? <p role="alert" className="animate-rise-in text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <Button type="submit" disabled={pending || code.length !== 6} className="w-full disabled:opacity-60">
          {pending ? "Verificando..." : "Confirmar código"}
        </Button>
        <button type="button" onClick={cancelCode} className="self-start text-sm font-semibold text-accent-600 dark:text-accent-300">
          Voltar e entrar de novo
        </button>
      </form>
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

          {unverified ? (
            <div className="flex flex-col gap-2 text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={pending}
                className="self-start font-semibold text-accent-600 disabled:opacity-60 dark:text-accent-300"
              >
                Reenviar e-mail de confirmação
              </button>
              {resendNote ? (
                <p role="status" className="text-zinc-500 dark:text-stone-400">
                  {resendNote}
                </p>
              ) : null}
            </div>
          ) : null}

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
            readOnly={codeSent}
          />
          {codeSent ? (
            <div className="flex flex-col gap-2">
              <Input
                label="Código enviado ao e-mail"
                name="emailCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                maxLength={6}
              />
              {codeNote ? (
                <p role="status" className="text-xs text-zinc-500 dark:text-stone-400">
                  {codeNote}
                </p>
              ) : null}
              <div className="flex gap-4 text-sm">
                <button type="button" onClick={handleResendCode} disabled={pending} className="font-semibold text-accent-600 disabled:opacity-60 dark:text-accent-300">
                  Reenviar código
                </button>
                <button type="button" onClick={changeEmail} className="font-semibold text-accent-600 dark:text-accent-300">
                  Alterar e-mail
                </button>
              </div>
            </div>
          ) : null}
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
            {pending ? "Criando..." : codeSent ? "Criar conta" : "Continuar"}
          </Button>
        </form>
      )}
    </div>
  );
}

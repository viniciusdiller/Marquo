"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEGAL_DOCS_VERSION } from "@marquo/shared-types";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import { ApiError, publicApi } from "@/lib/api";
import type { PlanTier } from "@/lib/billing";
import { planCookieValue } from "@/lib/signup-plan";
import { loginAction, resendVerificationAction } from "../entrar/actions";

// Espelham SignupDto (backend): a validação de verdade é lá; isto só evita ida e volta.
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

function signupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 409) return error.message;
    if (error.statusCode === 429) {
      return "Muitos cadastros feitos desta rede em pouco tempo. Tente novamente mais tarde.";
    }
    if (error.statusCode === 400) {
      // Termos desatualizados / cupom inválido: a mensagem do backend diz o que fazer.
      return error.message.includes("Termos") || error.message.includes("Cupom")
        ? error.message
        : "Confira os dados informados e tente de novo.";
    }
  }
  return "Não foi possível criar a conta. Tente novamente.";
}

export function SignupForm({ selectedTier = null }: { selectedTier?: PlanTier | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  // Conta criada, falta confirmar o e-mail: guarda o endereço para mostrar a tela de "confira sua caixa de entrada".
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  function handleResend() {
    setResendNote(null);
    startTransition(async () => {
      const result = await resendVerificationAction(awaitingEmail ?? "");
      setResendNote(result.ok ? "Enviamos um novo link. Veja também a caixa de spam." : result.error);
    });
  }

  function handleSubmit(e: React.FormEvent) {
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

    if (!accepted) {
      setError("Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.");
      return;
    }

    startTransition(async () => {
      let created: { slug: string; emailVerificationRequired?: boolean };
      try {
        created = await publicApi.signup({
          businessName,
          ownerName,
          email,
          phone,
          password,
          ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
          acceptedTermsVersion: LEGAL_DOCS_VERSION,
        });
      } catch (err) {
        setError(signupErrorMessage(err));
        return;
      }

      // Guarda o plano escolhido só para a tela de plano destacá-lo (preferência de apresentação; o cadastro
      // não envia plano ao backend e nada é cobrado por isto).
      if (selectedTier) document.cookie = planCookieValue(selectedTier);

      // Conta que exige confirmar o e-mail não entra ainda: mostra onde clicar, em vez de tentar o login.
      if (created.emailVerificationRequired) {
        setAwaitingEmail(email);
        return;
      }

      // Conta criada: já entra (mesma sessão NextAuth do /entrar). Se o login falhar por algum
      // motivo, a conta existe e o usuário só precisa entrar manualmente.
      const result = await loginAction(email, password, "/dashboard/agenda");
      if ("error" in result) {
        if (result.code === "EMAIL_NOT_VERIFIED") {
          setAwaitingEmail(email);
          return;
        }
        setError("Conta criada! Entre com seu e-mail e senha para continuar.");
        router.replace("/entrar");
        return;
      }
      // Conta de negócio recém-criada nunca é a da plataforma, então o código de 2FA não se aplica; trata só por completude.
      if ("needsCode" in result) {
        router.replace("/entrar");
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    });
  }

  if (awaitingEmail) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-zinc-900 dark:text-white">Confirme seu e-mail</h2>
        <p className="text-sm text-zinc-600 dark:text-stone-300">
          Sua conta foi criada. Enviamos um link de confirmação para <strong>{awaitingEmail}</strong>. Abra o e-mail e
          clique no link para entrar. Ele vale por 24 horas.
        </p>
        <p className="text-sm text-zinc-500 dark:text-stone-400">Não chegou? Veja a caixa de spam ou peça um novo link.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleResend} disabled={pending} className="disabled:opacity-60">
            Reenviar e-mail
          </Button>
          <Link href="/entrar" className="text-sm font-semibold text-accent-600 dark:text-accent-300">
            Ir para o login
          </Link>
        </div>
        {resendNote ? <p className="text-sm text-zinc-500 dark:text-stone-400">{resendNote}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nome do seu negócio"
        name="businessName"
        autoComplete="organization"
        placeholder="Ex.: Barbearia do Zé"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        required
        minLength={2}
        maxLength={120}
      />
      <Input
        label="Seu nome"
        name="ownerName"
        autoComplete="name"
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        required
        minLength={2}
        maxLength={120}
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
      <MaskedInput
        mask="phone"
        label="Telefone (WhatsApp)"
        name="phone"
        type="tel"
        value={phone}
        onChange={setPhone}
        required
        hint="Para a equipe do Marquo falar com você sobre a sua conta."
      />
      <Input
        label="Crie uma senha"
        name="new-password"
        type="password"
        autoComplete="new-password"
        hint={`Mínimo de ${MIN_PASSWORD} caracteres.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        maxLength={MAX_PASSWORD}
      />
      <Input
        label="Confirme a senha"
        name="confirm"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        maxLength={MAX_PASSWORD}
      />

      <Input
        label="Cupom (opcional)"
        name="coupon"
        value={couponCode}
        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
        maxLength={32}
        autoComplete="off"
        placeholder="Tem um código promocional?"
      />

      <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-stone-300">
        <input
          type="checkbox"
          name="accepted"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" target="_blank" className="font-semibold text-accent-600 dark:text-accent-300">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link
            href="/privacidade"
            target="_blank"
            className="font-semibold text-accent-600 dark:text-accent-300"
          >
            Política de Privacidade
          </Link>
          .
        </span>
      </label>

      {error ? (
        <p role="alert" className="animate-rise-in text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2 w-full disabled:opacity-60">
        {pending ? "Criando sua conta..." : "Criar conta e começar o teste grátis"}
      </Button>

      <p className="text-center text-sm text-zinc-500 dark:text-stone-400">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-accent-600 dark:text-accent-300">
          Entrar
        </Link>
      </p>
    </form>
  );
}

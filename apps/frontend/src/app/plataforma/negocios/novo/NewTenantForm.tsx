"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { createTenantAction, type PlatformActionResult } from "../../actions";

export function NewTenantForm() {
  const [pending, startTransition] = useTransition();
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PlatformActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTenantAction({
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPhone,
      });
      if (result.ok) {
        setCreated(result);
      } else {
        setError(result.error ?? "Não foi possível criar o negócio.");
      }
    });
  }

  if (created?.ok && created.link) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div>
          <p className="font-semibold text-zinc-900 dark:text-white">
            {created.tenantName} foi criado
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-stone-300">
            O dono é {created.ownerEmail}. Envie o link abaixo a ele por outro canal (WhatsApp, por exemplo): é com
            ele que o dono define a senha. O link aparece só agora e vale até{" "}
            {created.expiresAt
              ? new Date(created.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
              : "24 horas"}
            .
          </p>
        </div>
        <input
          readOnly
          value={created.link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link para o dono definir a senha"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(created.link as string);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
          >
            {copied ? "Copiado" : "Copiar link"}
          </button>
          {created.tenantId ? (
            <Link
              href={`/plataforma/negocios/${created.tenantId}`}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-100 dark:ring-white/20 dark:hover:bg-white/10"
            >
              Abrir negócio
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <Input
        label="Nome do negócio"
        name="businessName"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        required
        minLength={2}
        maxLength={120}
        placeholder="Ex.: Barbearia do Zé"
      />
      <Input
        label="Nome do dono"
        name="ownerName"
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        required
        minLength={2}
        maxLength={120}
        autoComplete="off"
      />
      <Input
        label="E-mail do dono"
        name="ownerEmail"
        type="email"
        value={ownerEmail}
        onChange={(e) => setOwnerEmail(e.target.value)}
        required
        maxLength={254}
        autoComplete="off"
        hint="É o login do dono. Precisa ser um e-mail ainda não cadastrado."
      />
      <MaskedInput
        mask="phone"
        label="Telefone do dono (WhatsApp)"
        name="ownerPhone"
        type="tel"
        value={ownerPhone}
        onChange={setOwnerPhone}
        required
        hint="Para contato comercial (por exemplo, se a pessoa cancelar)."
      />

      <p className="text-xs text-zinc-500 dark:text-stone-400">
        O negócio nasce em período de teste de 14 dias, sem assinatura. Você não define a senha do dono.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar negócio"}
        </button>
      </div>
    </form>
  );
}

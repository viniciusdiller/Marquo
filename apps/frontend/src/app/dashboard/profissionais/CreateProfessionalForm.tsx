"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { Button } from "@/components/ui/Button";
import { createProfessionalAction, type CreateProfessionalState } from "./actions";

const initialState: CreateProfessionalState = {};

export interface ServiceChoice {
  id: string;
  name: string;
}

export function CreateProfessionalForm({
  services = [],
  selfEmail,
}: {
  services?: ServiceChoice[];
  // E-mail do dono, só quando ele AINDA não atende: habilita a opção "Eu também atendo" (usa a conta dele, sem outro e-mail/senha).
  selfEmail?: string;
}) {
  const [state, action, pending] = useActionState(createProfessionalAction, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [self, setSelf] = useState(false);
  const allSelected = services.length > 0 && selected.size === services.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-zinc-200 p-5 sm:grid-cols-3 dark:border-white/10">
      <div data-tour="professional-form-intro" className="sm:col-span-3 rounded-xl border border-accent-100 bg-accent-50/60 p-3 text-xs leading-relaxed text-accent-950 dark:border-accent-500/20 dark:bg-accent-500/10 dark:text-accent-200">
        💡 <strong>Marque abaixo os serviços que ele atende</strong> e, assim que cadastrar, clique em <strong>Gerenciar</strong> ao lado do nome dele para configurar os <strong>horários de expediente</strong>. Sem serviço e sem horário, os clientes não conseguem agendar com ele!
      </div>

      {selfEmail ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 text-sm has-checked:border-accent-400 has-checked:bg-accent-50/60 sm:col-span-3 dark:border-white/10 dark:has-checked:bg-accent-500/10">
          <input
            type="checkbox"
            name="self"
            checked={self}
            onChange={(e) => setSelf(e.target.checked)}
            className="mt-0.5 size-4 accent-accent-500"
          />
          <span>
            <span className="block font-semibold text-zinc-900 dark:text-white">Eu também atendo</span>
            <span className="block text-xs text-zinc-500 dark:text-stone-400">
              Cadastre você mesmo como profissional, com o login que já usa ({selfEmail}). Não precisa de outro e-mail nem de outra senha.
            </span>
          </span>
        </label>
      ) : null}

      {self ? (
        <p className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-600 sm:col-span-3 dark:bg-white/5 dark:text-stone-300">
          Você entra como sempre, com <strong>{selfEmail}</strong>, e passa a ter agenda e horários próprios.
        </p>
      ) : (
        <>
      <div data-tour="professional-name">
        <Input label="Nome" name="name" autoComplete="off" required minLength={2} maxLength={120} hint="Como aparece na agenda e na página pública." />
      </div>
      <div data-tour="professional-email">
      <Input
        label={
          <span className="flex items-center gap-1.5">
            E-mail
            <FieldHelp title="Login do Barbeiro">
              Cada profissional da equipe ganha um login independente no sistema para acompanhar sua própria agenda e atendimentos pelo celular ou computador.
            </FieldHelp>
          </span>
        }
        name="email"
        type="email"
        autoComplete="off"
        required
        maxLength={254}
        hint="É o login do profissional. Não pode repetir um e-mail já cadastrado."
      />
      </div>
      <div data-tour="professional-password">
      <Input
        label="Senha inicial"
        name="initialPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        hint="Mínimo de 8 caracteres. Compartilhe com o profissional para o primeiro acesso."
      />
      </div>

        </>
      )}

      <fieldset data-tour="professional-services" className="sm:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-stone-200">Serviços que ele atende</legend>
          {services.length > 1 ? (
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(services.map((s) => s.id)))}
              className="text-xs font-semibold text-accent-600 hover:underline dark:text-accent-300"
            >
              {allSelected ? "Desmarcar todos" : "Marcar todos"}
            </button>
          ) : null}
        </div>
        {services.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-stone-400">
            Você ainda não tem serviços ativos.{" "}
            <Link href="/dashboard/servicos" className="font-semibold text-accent-600 hover:underline dark:text-accent-300">
              Cadastre os serviços
            </Link>{" "}
            para marcá-los aqui. Dá para vincular depois em Gerenciar.
          </p>
        ) : (
          <>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <li key={service.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm has-checked:border-accent-400 has-checked:bg-accent-50/60 dark:border-white/10 dark:has-checked:bg-accent-500/10">
                    <input
                      type="checkbox"
                      name="serviceIds"
                      value={service.id}
                      checked={selected.has(service.id)}
                      onChange={() => toggle(service.id)}
                      className="size-4 accent-accent-500"
                    />
                    <span className="min-w-0 truncate text-zinc-800 dark:text-stone-200">{service.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-stone-400">
              {selected.size === 0 ? "Nenhum marcado: dá para vincular depois em Gerenciar." : `${selected.size} de ${services.length} marcado${selected.size === 1 ? "" : "s"}.`}
            </p>
          </>
        )}
      </fieldset>

      {state?.error ? (
        <p className="sm:col-span-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <div className="sm:col-span-3">
        <span data-tour="professional-submit" className="inline-block">
          <Button type="submit" disabled={pending} className="disabled:opacity-60">
            {pending ? "Cadastrando..." : self ? "Cadastrar a mim como profissional" : "Cadastrar profissional"}
          </Button>
        </span>
      </div>
    </form>
  );
}

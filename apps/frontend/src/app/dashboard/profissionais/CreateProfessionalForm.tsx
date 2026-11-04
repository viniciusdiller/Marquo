"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { Button } from "@/components/ui/Button";
import { createProfessionalAction, type CreateProfessionalState } from "./actions";

const initialState: CreateProfessionalState = {};

export function CreateProfessionalForm() {
  const [state, action, pending] = useActionState(createProfessionalAction, initialState);

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-zinc-200 p-5 sm:grid-cols-3 dark:border-white/10">
      <div className="sm:col-span-3 rounded-xl border border-accent-100 bg-accent-50/60 p-3 text-xs leading-relaxed text-accent-950 dark:border-accent-500/20 dark:bg-accent-500/10 dark:text-accent-200">
        💡 <strong>Passo seguinte obrigatório:</strong> Assim que cadastrar o barbeiro, clique em <strong>Gerenciar</strong> ao lado do nome dele para configurar os <strong>horários de expediente</strong> e marcar os <strong>serviços que ele atende</strong>. Sem isso, os clientes não conseguem agendar com ele!
      </div>

      <Input label="Nome" name="name" autoComplete="off" required minLength={2} maxLength={120} hint="Como aparece na agenda e na página pública." />
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

      {state?.error ? (
        <p className="sm:col-span-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending} className="disabled:opacity-60">
          {pending ? "Cadastrando..." : "Cadastrar profissional"}
        </Button>
      </div>
    </form>
  );
}

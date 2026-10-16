"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Avatar } from "@/components/ui/Avatar";
import { riseIn } from "@/lib/stagger";
import { toggleProfessionalActiveAction } from "./actions";

export function ProfessionalRow({
  id,
  name,
  photoUrl = null,
  email,
  isActive,
  canManage,
  index = 0,
}: {
  id: string;
  name: string;
  photoUrl?: string | null;
  email?: string;
  isActive: boolean;
  canManage: boolean;
  index?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  function toggleActive() {
    startTransition(async () => {
      setError(null);
      const result = await toggleProfessionalActiveAction(id, !isActive);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <li
      style={riseIn(index)}
      className="animate-rise-in flex flex-col gap-1 py-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} photoUrl={photoUrl} size={44} tone="brand" />
          <div className="min-w-0">
          <Link
            href={`/dashboard/profissionais/${id}`}
            className="font-medium text-zinc-900 hover:text-accent-600 dark:text-white dark:hover:text-accent-300"
          >
            {name}
          </Link>
          {email ? <p className="text-sm text-zinc-500 dark:text-stone-400">{email}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              isActive
                ? "bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"
                : "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-stone-400",
            )}
          >
            {isActive ? "Ativo" : "Inativo"}
          </span>

          <Link
            href={`/dashboard/profissionais/${id}`}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-stone-400 dark:hover:text-stone-200"
          >
            Gerenciar
          </Link>

          {canManage ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => (isActive ? setConfirmingDeactivate(true) : toggleActive())}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200"
            >
              {isActive ? "Desativar" : "Ativar"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      <ConfirmDialog
        open={confirmingDeactivate}
        onOpenChange={setConfirmingDeactivate}
        title="Desativar este profissional?"
        description={`${name} deixa de aparecer pra novos agendamentos. Se já tiver atendimento futuro marcado, não vai dar pra desativar até remarcar ou cancelar. Dá pra reativar depois.`}
        confirmLabel="Desativar"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => {
          setConfirmingDeactivate(false);
          toggleActive();
        }}
      />
    </li>
  );
}

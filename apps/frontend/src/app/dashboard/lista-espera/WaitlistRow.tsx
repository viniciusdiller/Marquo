"use client";

import { useState, useTransition } from "react";
import type { WaitlistEntryAdmin } from "@marquo/shared-types";
import { riseIn } from "@/lib/stagger";
import { formatPreferredDate } from "@/lib/waitlist";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { updateWaitlistStatusAction } from "./actions";

const btn =
  "rounded-md px-2 py-1 text-sm font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent";
const muted = "text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-stone-400 dark:hover:bg-white/5 dark:hover:text-stone-200";

export function WaitlistRow({
  entry,
  message,
  canEdit,
  index = 0,
}: {
  entry: WaitlistEntryAdmin;
  message: string;
  canEdit: boolean;
  index?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateStatus(status: string) {
    startTransition(async () => {
      setError(null);
      const result = await updateWaitlistStatusAction(entry.id, status);
      if (result?.error) setError(result.error);
    });
  }

  const day = formatPreferredDate(entry.preferredDate);
  const since = new Date(entry.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const open = entry.status === "PENDING" || entry.status === "CONTACTED";

  return (
    <li style={riseIn(index)} className="animate-rise-in flex flex-col gap-1 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-zinc-900 dark:text-white">{entry.clientName}</p>
          <p className="text-sm text-zinc-500 dark:text-stone-400">
            {entry.serviceName}
            {entry.professionalName ? ` · com ${entry.professionalName}` : " · qualquer profissional"}
            {day ? ` · dia ${day}` : " · sem dia definido"}
          </p>
          <p className="text-xs text-zinc-400">
            {entry.clientPhone} · na lista desde {since}
          </p>
          {entry.notes ? <p className="mt-1 text-xs text-zinc-500 italic dark:text-stone-400">“{entry.notes}”</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {open ? <WhatsAppButton phone={entry.clientPhone} name={entry.clientName} text={message} /> : null}
          {canEdit && entry.status === "PENDING" ? (
            <button type="button" disabled={isPending} onClick={() => updateStatus("CONTACTED")} title="Só marca que você já falou com o cliente: ele continua na lista" className={`${btn} ${muted}`}>
              Marcar como contatado
            </button>
          ) : null}
          {canEdit && entry.status === "CONTACTED" ? (
            <button type="button" disabled={isPending} onClick={() => updateStatus("PENDING")} title="Volta para a aba Aguardando" className={`${btn} ${muted}`}>
              Voltar para aguardando
            </button>
          ) : null}
          {canEdit && open ? (
            <>
              <button type="button" disabled={isPending} onClick={() => updateStatus("RESOLVED")} title="O cliente foi atendido (agendou): sai da lista" className={`${btn} text-accent-600 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-500/10`}>
                Resolver
              </button>
              <button type="button" disabled={isPending} onClick={() => updateStatus("CANCELED")} title="O cliente desistiu: sai da lista" className={`${btn} text-zinc-400 hover:text-red-500`}>
                Cancelar
              </button>
            </>
          ) : null}
          {!open ? (
            <span className="text-xs text-zinc-400">{entry.status === "RESOLVED" ? "resolvido" : "cancelado"}</span>
          ) : null}
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </li>
  );
}

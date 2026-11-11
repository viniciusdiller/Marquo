"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "../ui/Button";
import type { WaitlistActionResult } from "@/app/[slug]/agendar/actions";

// Sem campos de nome/telefone: a lista de espera também exige login, e o contato é o da conta.
export function WaitlistForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (notes?: string) => Promise<WaitlistActionResult>;
  onCancel: () => void;
}) {
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [already, setAlready] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(notes.trim() || undefined);
    setSubmitting(false);
    if ("ok" in result) {
      setAlready(result.alreadyWaiting === true);
      setDone(true);
      return;
    }
    setError(result.error);
    setNeedsLogin(!!result.unauthorized);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-white/15">
        <CheckCircle size={32} weight="fill" className="text-(--tenant-accent)" />
        <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-white">
          {already ? "Você já estava na lista de espera" : "Você entrou na lista de espera"}
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          {already
            ? "Não precisa entrar de novo: o negócio já tem o seu pedido."
            : "O negócio vai te chamar no WhatsApp assim que abrir um horário."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <p className="text-sm font-medium text-zinc-900 dark:text-white">Entrar na lista de espera</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
        Usamos o telefone da sua conta pra te chamar no WhatsApp quando abrir um horário.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="waitlist-notes" className="text-sm font-medium text-zinc-700 dark:text-stone-200">
            Recado para o negócio (opcional)
          </label>
          <textarea
            id="waitlist-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Ex.: prefiro de manhã"
            className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/20 focus:outline-none dark:border-white/15 dark:bg-zinc-900 dark:text-white dark:placeholder:text-stone-500"
          />
        </div>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {needsLogin ? (
          <Link
            href={`/entrar?next=${encodeURIComponent(pathname)}`}
            className="text-sm font-semibold text-(--tenant-accent)"
          >
            Entrar na minha conta
          </Link>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" variant="tenant" disabled={submitting} className="flex-1">
            {submitting ? "Enviando..." : "Entrar na lista"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Voltar
          </Button>
        </div>
      </div>
    </form>
  );
}

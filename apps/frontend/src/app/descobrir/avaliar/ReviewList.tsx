"use client";

import { useState } from "react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { Star } from "@phosphor-icons/react/dist/ssr";
import type { ReviewablePastAppointment } from "@marquo/shared-types";
import { submitReviewAction } from "./actions";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:border-accent-500 rounded-md";

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} estrelas`}
          className={FOCUS_RING}
        >
          <Star size={24} weight={n <= value ? "fill" : "regular"} className="text-amber-500" />
        </button>
      ))}
    </div>
  );
}

export function ReviewList({ pending }: { pending: ReviewablePastAppointment[] }) {
  const [rating, setRating] = useState<Record<string, number>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function submitReview(appointmentId: string) {
    setMsg(null);
    setSending((s) => ({ ...s, [appointmentId]: true }));
    const result = await submitReviewAction({
      appointmentId,
      rating: rating[appointmentId] ?? 5,
      comment: comment[appointmentId]?.trim() || undefined,
    });
    if (result.error) setMsg(result.error);
    else setDone((d) => ({ ...d, [appointmentId]: true }));
    setSending((s) => ({ ...s, [appointmentId]: false }));
  }

  if (pending.length === 0) {
    return (
      <p className="mt-6 text-sm text-zinc-500 dark:text-stone-400">
        Nenhuma visita concluída aguardando avaliação.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-6 space-y-4">
        {pending.map((a) => (
          <li key={a.id} className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
            <p className="font-medium text-zinc-900 dark:text-white">{a.tenant.name}</p>
            <p className="text-xs text-zinc-400">
              {a.items.map((i) => i.service.name).join(", ")} ·{" "}
              {DateTime.fromISO(a.startAt).setLocale("pt-BR").toFormat("dd/LL/yyyy")}
            </p>
            {done[a.id] ? (
              <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                Avaliação enviada. Obrigado!
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <Stars
                  value={rating[a.id] ?? 5}
                  onChange={(n) => setRating((r) => ({ ...r, [a.id]: n }))}
                />
                <textarea
                  value={comment[a.id] ?? ""}
                  onChange={(e) => setComment((c) => ({ ...c, [a.id]: e.target.value }))}
                  placeholder="Comentário (opcional)"
                  rows={2}
                  className={clsx(
                    "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white",
                    FOCUS_RING,
                  )}
                />
                <button
                  type="button"
                  onClick={() => submitReview(a.id)}
                  disabled={sending[a.id]}
                  className={clsx(
                    "rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60",
                    FOCUS_RING,
                  )}
                >
                  {sending[a.id] ? "Enviando..." : "Enviar avaliação"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {msg ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{msg}</p> : null}
    </>
  );
}

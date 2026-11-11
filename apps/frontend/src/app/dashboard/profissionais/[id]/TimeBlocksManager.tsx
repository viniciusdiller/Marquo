"use client";

import { useActionState, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Repeat, Trash } from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { createTimeBlockAction, deleteTimeBlockAction, type CreateTimeBlockState } from "./actions";

const TIMEZONE = "America/Sao_Paulo";

interface TimeBlock {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  recurrence: "NONE" | "DAILY";
  // Dia civil (a API devolve meia-noite UTC): usa só a parte da data.
  repeatUntil: string | null;
}

const initialState: CreateTimeBlockState = {};

const REPEAT_OPTIONS = [
  { value: "NONE", label: "Só neste dia" },
  { value: "DAILY", label: "Todo dia" },
] as const;

function describe(block: TimeBlock): string {
  const start = DateTime.fromISO(block.startAt).setZone(TIMEZONE).setLocale("pt-BR");
  const end = DateTime.fromISO(block.endAt).setZone(TIMEZONE);
  const hours = `${start.toFormat("HH:mm")} às ${end.toFormat("HH:mm")}`;
  if (block.recurrence !== "DAILY") return `${start.toFormat("dd/LL")} das ${hours}`;
  const until = block.repeatUntil ? DateTime.fromISO(block.repeatUntil.slice(0, 10)).toFormat("dd/LL/yyyy") : null;
  return `Todo dia das ${hours} · a partir de ${start.toFormat("dd/LL")}${until ? ` até ${until}` : ", sem data final"}`;
}

export function TimeBlocksManager({
  professionalId,
  blocks,
}: {
  professionalId: string;
  blocks: TimeBlock[];
}) {
  const boundAction = createTimeBlockAction.bind(null, professionalId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<"NONE" | "DAILY">("NONE");

  return (
    <div>
      <form action={action} className="grid gap-4 sm:grid-cols-4">
        <DatePicker
          label={repeat === "DAILY" ? "A partir de" : "Data"}
          name="date"
          required
          hint={repeat === "DAILY" ? "Primeiro dia do bloqueio." : "Dia do bloqueio."}
        />
        <TimePicker label="Início" name="startTime" required hint="Primeira hora indisponível." />
        <TimePicker label="Fim" name="endTime" required hint="Deve ser depois do início." />
        <Input label="Motivo (opcional)" name="reason" placeholder="Almoço" hint="Só você vê; ajuda a lembrar." />

        <div className="sm:col-span-4 flex flex-col gap-1.5">
          <span id="repeat-label" className="text-sm font-medium text-zinc-700 dark:text-stone-200">
            Repetir
          </span>
          <div role="radiogroup" aria-labelledby="repeat-label" className="flex w-fit overflow-hidden rounded-lg border border-zinc-300 text-sm font-medium dark:border-white/15">
            {REPEAT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={repeat === option.value}
                onClick={() => setRepeat(option.value)}
                className={clsx(
                  "px-4 py-2 transition-colors",
                  repeat === option.value
                    ? "bg-accent-500 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-stone-300 dark:hover:bg-white/5",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="repeat" value={repeat} />
          {repeat === "DAILY" ? (
            <div className="mt-2 max-w-xs">
              <DatePicker
                label="Repetir até (opcional)"
                name="repeatUntil"
                clearable
                hint="Em branco = todo dia, sem data final. Você pode remover o bloqueio quando quiser."
              />
            </div>
          ) : null}
        </div>

        {state?.error ? (
          <p className="sm:col-span-4 text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : null}

        <div className="sm:col-span-4">
          <Button type="submit" disabled={pending} variant="ghost" className="disabled:opacity-60">
            {pending ? "Bloqueando..." : "Bloquear horário"}
          </Button>
        </div>
      </form>

      {blocks.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-stone-400">Nenhum bloqueio cadastrado.</p>
      ) : (
        <ul className="mt-6 flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
          {blocks.map((block) => (
            <li key={block.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-white">
                  {block.recurrence === "DAILY" ? <Repeat size={14} className="text-accent-600 dark:text-accent-300" aria-hidden /> : null}
                  {describe(block)}
                </p>
                {block.reason ? (
                  <p className="text-sm text-zinc-500 dark:text-stone-400">{block.reason}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() =>
                  startDelete(async () => {
                    setDeleteError(null);
                    const result = await deleteTimeBlockAction(professionalId, block.id);
                    if (result?.error) setDeleteError(result.error);
                  })
                }
                className="p-1.5 text-zinc-400 hover:text-red-600 disabled:opacity-50"
                aria-label="Remover bloqueio"
              >
                <Trash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteError ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>
      ) : null}
    </div>
  );
}

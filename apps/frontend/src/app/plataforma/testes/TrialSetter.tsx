"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTrialAction } from "../actions";

const PRESETS = [7, 14, 30, 60];

// Define quanto teste grátis o negócio tem a partir de HOJE. Os atalhos só preenchem o campo (nada é salvo até clicar em
// Salvar). Zero encerra o teste agora.
export function TrialSetter({ tenantId, tenantName, currentDays }: { tenantId: string; tenantName: string; currentDays: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(String(Math.max(currentDays, 0) || 14));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const value = Number(days);
  const valid = days.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 365;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setTrialAction(tenantId, value);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5" aria-label={`Definir o teste de ${tenantName}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`days-${tenantId}`}>
          Dias de teste a partir de hoje para {tenantName}
        </label>
        <input
          id={`days-${tenantId}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setSaved(false);
          }}
          className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        />
        <span className="text-xs text-zinc-500 dark:text-stone-400">dias a partir de hoje</span>
        <button
          type="button"
          onClick={save}
          disabled={!valid || pending}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setDays(String(preset));
              setSaved(false);
            }}
            className="rounded-full px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-300 dark:ring-white/20"
          >
            {preset} dias
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setDays("0");
            setSaved(false);
          }}
          className="rounded-full px-2 py-0.5 text-xs text-red-600 ring-1 ring-red-200 ring-inset hover:bg-red-50 dark:text-red-300 dark:ring-red-500/30"
        >
          Encerrar agora
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
          Salvo.
        </p>
      ) : null}
    </div>
  );
}

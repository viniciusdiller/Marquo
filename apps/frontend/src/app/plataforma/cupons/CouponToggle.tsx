"use client";

import { useState, useTransition } from "react";
import { setCouponActiveAction } from "../actions";

export function CouponToggle({ couponId, code, isActive }: { couponId: string; code: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`${isActive ? "Desativar" : "Reativar"} o cupom ${code}`}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setCouponActiveAction(couponId, !isActive);
            if (!result.ok) setError(result.error ?? "Não foi possível alterar.");
          });
        }}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 disabled:opacity-60 dark:text-stone-100 dark:ring-white/20 dark:hover:bg-white/10"
      >
        {pending ? "..." : isActive ? "Desativar" : "Reativar"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}

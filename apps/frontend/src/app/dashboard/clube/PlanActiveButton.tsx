"use client";

import { useState, useTransition } from "react";
import { setClubPlanActiveAction } from "./actions";

// Desativar um pacote não mexe em quem já está nele: só impede novas adesões.
export function PlanActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setClubPlanActiveAction(id, !isActive);
            setError(result.error ?? null);
          })
        }
        className="text-xs font-semibold text-accent-600 hover:underline disabled:opacity-60 dark:text-accent-300"
      >
        {isActive ? "Desativar" : "Reativar"}
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </span>
  );
}

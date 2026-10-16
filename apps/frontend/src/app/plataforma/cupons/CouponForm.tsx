"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { moneyToCents } from "@/lib/masks";
import { createCouponAction } from "../actions";

type Kind = "TRIAL_DAYS" | "PERCENT" | "FIXED_CENTS";

const SELECT =
  "rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-[15px] text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white";

export function CouponForm() {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Kind>("TRIAL_DAYS");
  const [value, setValue] = useState("");
  const [money, setMoney] = useState("");
  const [description, setDescription] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);

    let amount: number | null;
    if (kind === "FIXED_CENTS") {
      amount = moneyToCents(money);
      if (amount === null || amount < 1) {
        setError("Informe um valor em reais válido.");
        return;
      }
    } else {
      amount = Number(value);
      if (!Number.isInteger(amount) || amount < 1) {
        setError(kind === "PERCENT" ? "Informe um percentual de 1 a 100." : "Informe os dias (1 a 365).");
        return;
      }
    }

    const max = maxRedemptions ? Number(maxRedemptions) : undefined;
    if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
      setError("O limite de usos precisa ser um número inteiro maior que zero.");
      return;
    }

    startTransition(async () => {
      const result = await createCouponAction({
        code: code.trim().toUpperCase(),
        kind,
        value: amount as number,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(max !== undefined ? { maxRedemptions: max } : {}),
        // Fim do dia (horário de Brasília) escolhido, para o cupom valer durante todo aquele dia.
        ...(validUntil ? { validUntil: new Date(`${validUntil}T23:59:59-03:00`).toISOString() } : {}),
      });
      if (result.ok) {
        setDone(`Cupom ${code.trim().toUpperCase()} criado.`);
        setCode("");
        setValue("");
        setMoney("");
        setDescription("");
        setMaxRedemptions("");
        setValidUntil("");
        setOpen(false);
      } else {
        setError(result.error ?? "Não foi possível criar o cupom.");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
        >
          Novo cupom
        </button>
        {done ? (
          <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
            {done}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex max-w-xl flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-white/10"
    >
      <Input
        label="Código"
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        required
        minLength={3}
        maxLength={32}
        autoComplete="off"
        placeholder="Ex.: BEMVINDO30"
        hint="3 a 32 caracteres: letras, números, _ e -. É o que o cliente digita."
        className="font-mono"
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="coupon-kind" className="text-sm font-medium text-zinc-700 dark:text-stone-200">
          Benefício
        </label>
        <select
          id="coupon-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          className={clsx(SELECT)}
        >
          <option value="TRIAL_DAYS">Dias extras de teste</option>
          <option value="PERCENT">Desconto em %</option>
          <option value="FIXED_CENTS">Desconto fixo em R$</option>
        </select>
      </div>

      {kind === "FIXED_CENTS" ? (
        <MaskedInput mask="money" label="Valor do desconto (R$)" name="money" value={money} onChange={setMoney} required />
      ) : (
        <Input
          label={kind === "PERCENT" ? "Percentual (1 a 100)" : "Dias extras (1 a 365)"}
          name="value"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))}
          required
        />
      )}

      <Input
        label="Descrição (opcional)"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        placeholder="Ex.: Campanha Dia dos Pais"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Limite de usos (opcional)"
          name="maxRedemptions"
          inputMode="numeric"
          value={maxRedemptions}
          onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, "").slice(0, 7))}
          hint="Em branco = sem limite."
        />
        <Input
          label="Vale até (opcional)"
          name="validUntil"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          hint="Inclusive o dia escolhido."
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar cupom"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-100 dark:ring-white/20 dark:hover:bg-white/10"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

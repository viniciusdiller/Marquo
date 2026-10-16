"use client";

import { type ComponentPropsWithoutRef, forwardRef, useState } from "react";
import clsx from "clsx";
import { Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label: string;
  error?: string;
  hint?: string;
  // true dentro da página pública do tenant/wizard/conta do cliente, onde o foco deve usar
  // a cor de destaque escopada ao tenant (--tenant-accent) em vez da marca fixa do
  // Marquo. Padrão false — não afeta staff login nem formulários do dashboard.
  accentScoped?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, accentScoped, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  // Campo de senha ganha o botão de mostrar/ocultar. O valor continua sendo o do estado de quem
  // chama (nada é guardado aqui); só o `type` do input alterna entre "password" e "text".
  const isPassword = props.type === "password";
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-700 dark:text-stone-200">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "w-full",
            isPassword && "pr-11",
            "rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:border-white/15 dark:bg-zinc-900 dark:text-white dark:placeholder:text-stone-500",
            accentScoped
              ? "focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/20"
              : "focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20",
            error && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
          type={isPassword && visible ? "text" : props.type}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-zinc-400 transition-colors hover:text-zinc-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 dark:text-stone-500 dark:hover:text-stone-200"
          >
            {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-zinc-500 dark:text-stone-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

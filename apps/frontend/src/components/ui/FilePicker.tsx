"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip } from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";

// Botão de anexar arquivo. Substitui o <input type="file"> cru do navegador, onde só o texto pequeno ("Escolher
// arquivo") era clicável e sobrava um "Nenhum arquivo escolhido" fora do padrão do app.
//
// O <input> continua DENTRO do formulário (visualmente oculto, mas presente), então o arquivo vai normalmente no
// FormData do Server Action. Quem chama pode tratar o arquivo antes do envio (ex.: comprimir) no `onChange`: o
// nome exibido é lido depois dele, já do arquivo final.
export function FilePicker({
  name = "file",
  accept,
  label = "Anexar imagem",
  changeLabel = "Trocar imagem",
  disabled = false,
  onChange,
  onSelectionChange,
  className,
}: {
  name?: string;
  accept: string;
  label?: string;
  changeLabel?: string;
  disabled?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  // Avisa quem chama se há (ou não) um arquivo escolhido: serve para habilitar/desabilitar o botão "Enviar".
  onSelectionChange?: (fileName: string | null) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function update(next: string | null) {
    setFileName(next);
    onSelectionChange?.(next);
  }

  // Depois que o formulário é enviado o React o reinicia (reset): o nome exibido tem que voltar a "nenhum arquivo".
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setFileName(null);
      onSelectionChange?.(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [onSelectionChange]);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    await onChange?.(event);
    update(event.target.files?.[0]?.name ?? null);
  }

  return (
    <div className={clsx("flex min-w-0 items-center gap-3", className)}>
      {/* sr-only (e não display:none): continua no formulário e acessível por teclado/leitor de tela. */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Paperclip size={16} weight="bold" />
        {fileName ? changeLabel : label}
      </button>
      <span
        className="min-w-0 truncate text-sm text-zinc-500 dark:text-stone-400"
        title={fileName ?? undefined}
        aria-live="polite"
      >
        {fileName ?? "Nenhuma imagem anexada"}
      </span>
    </div>
  );
}

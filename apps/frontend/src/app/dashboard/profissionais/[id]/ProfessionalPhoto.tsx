"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { removeProfessionalPhotoAction, uploadProfessionalPhotoAction } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Conforto: já avisa tamanho/formato antes de enviar. O backend revalida tudo (tipo pelos bytes, 5 MB, WebP quadrado).
export function ProfessionalPhoto({
  professionalId,
  name,
  photoUrl,
}: {
  professionalId: string;
  name: string;
  photoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setError("Use uma imagem JPEG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("A imagem é grande demais (máximo 5 MB).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("file", file);
      const result = await uploadProfessionalPhotoAction(professionalId, data);
      if (result.error) setError(result.error);
    });
  }

  return (
    <section className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <Avatar name={name} photoUrl={photoUrl} size={88} tone="brand" />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">Foto</h2>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-stone-400">
          Aparece para o cliente ao escolher o profissional e na página do negócio. Fica recortada em quadrado:
          prefira uma foto de rosto, com boa luz.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Escolher foto do profissional"
            onChange={onPick}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
          >
            {pending ? "Enviando..." : photoUrl ? "Trocar foto" : "Enviar foto"}
          </button>
          {photoUrl ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmRemove(true)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 disabled:opacity-60 dark:text-stone-200 dark:ring-white/20 dark:hover:bg-white/10"
            >
              Remover
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remover a foto?"
        description="O profissional volta a aparecer com as iniciais."
        confirmLabel="Remover foto"
        tone="danger"
        isLoading={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await removeProfessionalPhotoAction(professionalId);
            if (result.error) setError(result.error);
            setConfirmRemove(false);
          })
        }
      />
    </section>
  );
}

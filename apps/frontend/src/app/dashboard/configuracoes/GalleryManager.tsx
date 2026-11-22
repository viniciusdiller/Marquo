"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Paperclip } from "@phosphor-icons/react/dist/ssr";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { compressImageFile } from "@/lib/image-compression";
import { riseIn } from "@/lib/stagger";
import {
  uploadGalleryImageAction,
  removeGalleryImageAction,
} from "./actions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
// Mesma dimensão máxima usada pelo backend pra galeria (GALLERY_MAX_DIMENSION em
// tenants.service.ts) — comprimir pra um tamanho maior que isso no navegador seria
// desperdício, o backend ia reduzir de novo do mesmo jeito.
const MAX_DIMENSION = 1600;

function RemoveImageButton({ onRequestConfirm }: { onRequestConfirm: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        // Sem confirmação era um clique só. Sem JS o botão continua type=submit e remove
        // direto — o handler só roda se o JS carregar.
        event.preventDefault();
        onRequestConfirm();
      }}
      className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-wait"
    >
      {pending ? "Removendo..." : "Remover"}
    </button>
  );
}

function GalleryImage({
  image,
  index = 0,
}: {
  image: { id: string; url: string };
  index?: number;
}) {
  const [state, action] = useActionState(removeGalleryImageAction.bind(null, image.id), {});
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      style={riseIn(index)}
      className="animate-rise-in hover-lift group relative aspect-square overflow-hidden rounded-xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${API_URL}${image.url}`} alt="" className="h-full w-full object-cover" />
      <form ref={formRef} action={action}>
        <RemoveImageButton onRequestConfirm={() => setConfirming(true)} />
      </form>
      {state?.error ? (
        <p className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-center text-xs text-white">
          {state.error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remover esta foto?"
        description="Ela some da galeria da página pública."
        confirmLabel="Remover"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />
    </div>
  );
}

// Teto da galeria (mesmo MAX_GALLERY_IMAGES do backend, que confere de novo a cada foto).
const MAX_GALLERY_IMAGES = 12;

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

export function GalleryManager({ images }: { images: { id: string; url: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const freeSlots = Math.max(0, MAX_GALLERY_IMAGES - images.length);
  const uploading = progress !== null;
  const busy = compressing || uploading;

  // URLs temporárias das prévias: liberadas quando a foto sai da fila ou o componente desmonta.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);
  // Chave das prévias (crypto.randomUUID não existe em http pela rede local).
  const nextId = useRef(0);

  async function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    // Limpa o input: escolher as mesmas fotos de novo dispara o change outra vez.
    e.target.value = "";
    if (chosen.length === 0) return;
    setErrors([]);

    const room = freeSlots - pending.length;
    const accepted = chosen.slice(0, Math.max(0, room));
    setNotice(
      accepted.length < chosen.length
        ? `A galeria aceita até ${MAX_GALLERY_IMAGES} fotos: ${chosen.length - accepted.length} ${chosen.length - accepted.length === 1 ? "ficou" : "ficaram"} de fora.`
        : null,
    );
    if (accepted.length === 0) return;

    setCompressing(true);
    const compressed = await Promise.all(accepted.map((file) => compressImageFile(file, { maxDimension: MAX_DIMENSION })));
    setCompressing(false);
    setPending((current) => [
      ...current,
      ...compressed.map((file) => ({ id: `foto-${nextId.current++}`, file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }

  function removePending(id: string) {
    setPending((current) => {
      const photo = current.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  async function uploadAll() {
    const queue = pending;
    if (queue.length === 0) return;
    setErrors([]);
    setNotice(null);
    setProgress({ done: 0, total: queue.length });
    const failed: PendingPhoto[] = [];
    const messages: string[] = [];
    // Uma foto por vez: cada envio fica bem abaixo do limite do Server Action e o backend confere o teto a cada foto.
    for (const [index, photo] of queue.entries()) {
      const data = new FormData();
      data.set("file", photo.file);
      const result = await uploadGalleryImageAction(undefined, data).catch(() => ({ error: "Não foi possível enviar a imagem." }));
      if (result?.error) {
        failed.push(photo);
        messages.push(`${photo.file.name}: ${result.error}`);
      } else {
        URL.revokeObjectURL(photo.previewUrl);
      }
      setProgress({ done: index + 1, total: queue.length });
    }
    setPending(failed);
    setErrors(messages);
    setProgress(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Galeria</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
        Fotos do espaço e do trabalho, mostradas na página pública (até {MAX_GALLERY_IMAGES} fotos). Dá para escolher
        várias de uma vez.
      </p>

      {images.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((image, i) => (
            <GalleryImage key={image.id} image={image} index={i} />
          ))}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-stone-400">
            Prontas para enviar ({pending.length})
          </p>
          <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {pending.map((photo) => (
              <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg ring-2 ring-accent-500/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={`Prévia de ${photo.file.name}`} className="h-full w-full object-cover" />
                {!uploading ? (
                  <button
                    type="button"
                    onClick={() => removePending(photo.id)}
                    aria-label={`Tirar ${photo.file.name} da lista`}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFilesChosen}
          disabled={busy}
          className="sr-only"
          tabIndex={-1}
          aria-label="Escolher fotos"
        />
        <button
          type="button"
          disabled={busy || freeSlots - pending.length <= 0}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Paperclip size={16} weight="bold" />
          {pending.length > 0 ? "Escolher mais fotos" : "Escolher fotos"}
        </button>
        <Button type="button" variant="ghost" disabled={pending.length === 0 || busy} onClick={uploadAll} className="text-sm">
          {compressing
            ? "Preparando..."
            : progress
              ? `Enviando ${Math.min(progress.done + 1, progress.total)} de ${progress.total}...`
              : pending.length > 1
                ? `Adicionar ${pending.length} fotos`
                : "Adicionar foto"}
        </Button>
        <span className="text-sm text-zinc-500 dark:text-stone-400" aria-live="polite">
          {freeSlots === 0
            ? "Galeria cheia: remova uma foto para adicionar outra."
            : `${freeSlots - pending.length} ${freeSlots - pending.length === 1 ? "vaga" : "vagas"} restantes`}
        </span>
      </div>

      {notice ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul role="alert" className="mt-2 space-y-0.5 text-sm text-red-600 dark:text-red-400">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

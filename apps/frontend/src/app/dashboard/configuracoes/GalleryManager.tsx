"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { FilePicker } from "@/components/ui/FilePicker";
import { compressImageFile } from "@/lib/image-compression";
import { riseIn } from "@/lib/stagger";
import {
  uploadGalleryImageAction,
  removeGalleryImageAction,
  type UploadGalleryImageState,
} from "./actions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const uploadInitialState: UploadGalleryImageState = {};
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

export function GalleryManager({ images }: { images: { id: string; url: string }[] }) {
  const [uploadState, uploadFormAction, uploadPending] = useActionState(
    uploadGalleryImageAction,
    uploadInitialState,
  );
  const [compressing, setCompressing] = useState(false);
  const [photoChosen, setPhotoChosen] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    const compressed = await compressImageFile(file, { maxDimension: MAX_DIMENSION });
    setCompressing(false);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(compressed);
    e.target.files = dataTransfer.files;
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Galeria</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
        Fotos do espaço e do trabalho, mostradas na página pública (até 12 fotos).
      </p>

      {images.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((image, i) => (
            <GalleryImage key={image.id} image={image} index={i} />
          ))}
        </div>
      ) : null}

      <form action={uploadFormAction} className="mt-4 flex flex-wrap items-center gap-3">
        <FilePicker
          accept="image/jpeg,image/png,image/webp"
          label="Anexar foto"
          changeLabel="Trocar foto"
          onChange={handleFileChange}
          onSelectionChange={(name) => setPhotoChosen(name !== null)}
          disabled={uploadPending || compressing}
        />
        <Button
          type="submit"
          variant="ghost"
          disabled={!photoChosen || uploadPending || compressing}
          className="text-sm"
        >
          {compressing ? "Comprimindo..." : uploadPending ? "Enviando..." : "Adicionar foto"}
        </Button>
      </form>

      {uploadState?.error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadState.error}</p>
      ) : null}
    </div>
  );
}

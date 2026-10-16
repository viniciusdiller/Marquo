"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr";
import { GalleryLightbox } from "./GalleryLightbox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const LOGO_ID = "logo";

// A logo aparece recortada em quadrado no cabeçalho; clicar nela abre a imagem INTEIRA (sem recorte), na mesma janela
// da galeria. `src` é o caminho servido pelo backend (já com a versão para o cache).
export function LogoViewer({ src, name, className }: { src: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        layoutId={`gallery-photo-${LOGO_ID}`}
        onClick={() => setOpen(true)}
        aria-label={`Ver a logo de ${name} em tamanho grande`}
        className={`group relative block cursor-zoom-in overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/50 ${className ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${API_URL}${src}`}
          alt={`Logo de ${name}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/35 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <MagnifyingGlassPlus size={16} weight="bold" />
          </span>
        </span>
      </motion.button>

      <GalleryLightbox
        images={[{ id: LOGO_ID, url: src }]}
        index={open ? 0 : null}
        onClose={() => setOpen(false)}
        onNavigate={() => {}}
        label={`Logo de ${name}`}
      />
    </>
  );
}

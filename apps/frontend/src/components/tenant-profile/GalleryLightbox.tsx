"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";
import type { PublicGalleryImage } from "@marquo/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

export function GalleryLightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: PublicGalleryImage[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const open = index != null;

  // Trava o scroll da página (com compensação da largura da scrollbar, pra não dar
  // um "pulo" horizontal quando ela some) e fecha/navega pelo teclado.
  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate(((index as number) + 1) % images.length);
      if (e.key === "ArrowLeft") onNavigate(((index as number) - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, index, images.length, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Galeria de fotos"
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-xl sm:p-10"
          onClick={onClose}
        >
          <motion.div
            layoutId={`gallery-photo-${images[index as number].id}`}
            transition={reduceMotion ? { duration: 0 } : SPRING}
            className="relative max-h-[85vh] max-w-full overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_URL}${images[index as number].url}`}
              alt=""
              className="block max-h-[85vh] w-auto max-w-full object-contain"
            />

            <motion.button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              initial={reduceMotion ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60"
            >
              <X size={16} />
            </motion.button>
          </motion.div>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(((index as number) - 1 + images.length) % images.length);
                }}
                aria-label="Anterior"
                className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50 sm:left-6"
              >
                <CaretLeft size={20} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(((index as number) + 1) % images.length);
                }}
                aria-label="Próxima"
                className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50 sm:right-6"
              >
                <CaretRight size={20} />
              </button>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PublicGalleryImage } from "@marquo/shared-types";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";
import { GalleryLightbox } from "./GalleryLightbox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const STAGGER_CAP = 8;

// Bento em vez do masonry por colunas de antes: a 1ª foto de cada grupo de 5 vira um
// tile 2x2 em destaque, o resto preenche 1x1 ao redor — dá ritmo e uma "capa" pro
// olho pousar, sem o efeito de coluna-lê-fora-de-ordem do CSS columns.
function tileSpan(i: number) {
  return i % 5 === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-1";
}

export function GallerySection({ images }: { images: PublicGalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  if (images.length === 0) return null;

  return (
    <>
      <Reveal>
        <section className="border-t border-zinc-200 py-16 dark:border-white/10">
          <Container>
            <SectionHeading eyebrow="Nosso trabalho" title="Galeria" />

            <div className="mt-8 grid auto-rows-[130px] grid-cols-2 gap-3 sm:auto-rows-[150px] sm:grid-cols-3 lg:auto-rows-[170px] lg:grid-cols-4">
              {images.map((image, i) => (
                <motion.button
                  key={image.id}
                  type="button"
                  layoutId={`gallery-photo-${image.id}`}
                  onClick={() => setIndex(i)}
                  className={`group relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-white/5 ${tileSpan(i)}`}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: (i % STAGGER_CAP) * 0.05 }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_URL}${image.url}`}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </motion.button>
              ))}
            </div>
          </Container>
        </section>
      </Reveal>

      <GalleryLightbox images={images} index={index} onClose={() => setIndex(null)} onNavigate={setIndex} />
    </>
  );
}

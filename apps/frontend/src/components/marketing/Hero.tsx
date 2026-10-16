"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { MagnifyingGlass, MapPin } from "@phosphor-icons/react/dist/ssr";
import { Container } from "../ui/Container";
import { BrandPattern } from "../brand/BrandPattern";

// Hero de busca: a home é o ponto de entrada de quem procura um salão/barbearia (o discurso
// pro dono vive em /para-donos). A busca por texto usa "contains" no
// backend (livre), mas cidade é "equals" — por isso o campo de local é um <select> com as
// cidades que realmente têm negócio cadastrado, em vez de texto livre que podia não bater
// com nada.
export function Hero({ cities }: { cities: string[] }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (city) params.set("city", city);
    router.push(`/descobrir${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  return (
    <section id="top" className="relative isolate overflow-hidden pt-32 pb-24 lg:pt-40 lg:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-100/70 via-transparent to-transparent dark:from-accent-500/10"
      />

      <BrandPattern mask="radial-gradient(ellipse 70% 60% at 50% 0%, black 0%, transparent 75%)" />

      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-4xl font-bold tracking-tight text-balance text-zinc-900 md:text-5xl dark:text-white"
          >
            Encontre e agende horário em{" "}
            <span className="text-accent-500">salões perto de você</span>.
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed text-zinc-600 dark:text-stone-300"
          >
            Veja avaliações de quem já foi e marque online, sem precisar
            ligar ou trocar mensagem.
          </motion.p>

          <motion.form
            onSubmit={handleSubmit}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-2 text-left shadow-xl shadow-zinc-900/5 sm:flex-row sm:items-center dark:border-white/10 dark:bg-zinc-900"
          >
            <label className="flex flex-1 items-center gap-2.5 rounded-xl px-4 py-3">
              <MagnifyingGlass size={18} className="shrink-0 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Salão, barbearia ou serviço"
                aria-label="Salão, barbearia ou serviço"
                className="w-full bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white"
              />
            </label>

            <div className="hidden h-6 w-px shrink-0 bg-zinc-200 sm:block dark:bg-white/10" />

            <label className="flex flex-1 items-center gap-2.5 rounded-xl px-4 py-3">
              <MapPin size={18} className="shrink-0 text-zinc-400" />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label="Cidade"
                className="w-full bg-transparent text-[15px] text-zinc-900 outline-none dark:text-white dark:[color-scheme:dark]"
              >
                <option value="">Onde você está?</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="shrink-0 rounded-xl bg-accent-500 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-accent-600"
            >
              Buscar
            </button>
          </motion.form>
        </div>
      </Container>
    </section>
  );
}

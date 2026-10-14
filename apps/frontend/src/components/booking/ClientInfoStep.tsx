"use client";

import { DateTime } from "luxon";
import type { PublicProfessional, PublicService } from "@marquo/shared-types";

const TIMEZONE = "America/Sao_Paulo";

// Só confirma: agendar exige login, então quem está agendando é sempre a conta logada (nome e
// telefone vêm da sessão, nunca de um formulário aqui).
export function ClientInfoStep({
  service,
  professional,
  startAt,
  client,
}: {
  service: PublicService;
  professional: PublicProfessional;
  startAt: string;
  client: { name: string; phone: string };
}) {
  const formattedDate = DateTime.fromISO(startAt)
    .setZone(TIMEZONE)
    .setLocale("pt-BR")
    .toFormat("cccc, d 'de' LLLL 'às' HH:mm");

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
        <p className="font-display font-semibold text-zinc-900 dark:text-white">{service.name}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-stone-300">
          Com {professional.name}
        </p>
        <p className="mt-1 text-sm text-zinc-600 capitalize dark:text-stone-300">
          {formattedDate}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 text-sm dark:border-white/10">
        <p className="text-zinc-500 dark:text-stone-400">Agendando como</p>
        <p className="mt-0.5 font-medium text-zinc-900 dark:text-white">
          {client.name} · {client.phone}
        </p>
      </div>
    </div>
  );
}

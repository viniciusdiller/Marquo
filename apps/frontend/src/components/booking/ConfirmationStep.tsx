import { DateTime } from "luxon";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import type { PublicBooking } from "@marquo/shared-types";
import { Button } from "../ui/Button";

const TIMEZONE = "America/Sao_Paulo";

// Entrada em sequência (--i): o check salta com um anel que se dissipa, depois o texto e o
// resumo sobem um a um — o momento de "deu certo" precisa ser sentido, não só lido.
const at = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function ConfirmationStep({ booking }: { booking: PublicBooking }) {
  const formattedDate = DateTime.fromISO(booking.startAt)
    .setZone(TIMEZONE)
    .setLocale("pt-BR")
    .toFormat("cccc, d 'de' LLLL 'às' HH:mm");

  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="relative">
        <span
          aria-hidden
          className="animate-ring-out absolute inset-0 rounded-full bg-(--tenant-accent)/30"
        />
        <CheckCircle
          size={56}
          weight="fill"
          className="animate-pop-in relative text-(--tenant-accent)"
        />
      </div>
      <h2
        style={at(3)}
        className="animate-rise-in mt-5 font-display text-2xl font-bold text-zinc-900 dark:text-white"
      >
        Agendamento confirmado
      </h2>
      <p
        style={at(4)}
        className="animate-rise-in mt-2 max-w-sm text-[15px] text-zinc-600 capitalize dark:text-stone-300"
      >
        {formattedDate}
      </p>

      <div
        style={at(5)}
        className="animate-rise-in mt-8 w-full max-w-sm rounded-2xl border border-zinc-200 p-5 text-left dark:border-white/10"
      >
        <p className="text-sm text-zinc-500 dark:text-stone-400">Serviço</p>
        <p className="font-medium text-zinc-900 dark:text-white">{booking.service?.name}</p>
        <p className="mt-3 text-sm text-zinc-500 dark:text-stone-400">Profissional</p>
        <p className="font-medium text-zinc-900 dark:text-white">
          {booking.professional?.user.name}
        </p>
      </div>

      <p
        style={at(6)}
        className="animate-rise-in mt-6 max-w-sm text-sm text-zinc-500 dark:text-stone-400"
      >
        Você pode cancelar ou remarcar quando precisar, na sua agenda.
      </p>
      <div style={at(7)} className="animate-rise-in">
        <Button href="/minha-conta" variant="ghost" className="mt-3">
          Gerenciar agendamento
        </Button>
      </div>
    </div>
  );
}

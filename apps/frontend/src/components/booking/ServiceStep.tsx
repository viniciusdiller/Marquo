import type { PublicService } from "@marquo/shared-types";
import { RadioCard } from "../ui/RadioCard";

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${rest}` : `${hours}h`;
}

export function ServiceStep({
  services,
  selectedId,
  onSelect,
}: {
  services: PublicService[];
  selectedId: string | null;
  onSelect: (service: PublicService) => void;
}) {
  if (services.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-stone-400">
        Este negócio ainda não tem serviços disponíveis para agendamento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {services.map((service) => (
        <RadioCard
          key={service.id}
          selected={service.id === selectedId}
          onClick={() => onSelect(service)}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-semibold text-zinc-900 dark:text-white">
                {service.name}
              </p>
              {service.description ? (
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-stone-400">
                  {service.description}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
                {formatDuration(service.durationMinutes)}
              </p>
            </div>
            <span className="shrink-0 font-display font-semibold text-zinc-900 dark:text-white">
              {formatPrice(service.priceCents)}
            </span>
          </div>
        </RadioCard>
      ))}
    </div>
  );
}

import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import type { PublicProfessional } from "@marquo/shared-types";
import { RadioCard } from "../ui/RadioCard";

export function ProfessionalStep({
  professionals,
  selectedId,
  onSelect,
}: {
  professionals: PublicProfessional[];
  selectedId: string | null;
  onSelect: (professional: PublicProfessional) => void;
}) {
  if (professionals.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-stone-400">
        Nenhum profissional disponível para este serviço no momento.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {professionals.map((professional) => (
        <RadioCard
          key={professional.id}
          selected={professional.id === selectedId}
          onClick={() => onSelect(professional)}
        >
          <div className="flex items-center gap-3">
            <UserCircle size={32} weight="light" className="shrink-0 text-(--tenant-accent)" />
            <div>
              <p className="font-display font-semibold text-zinc-900 dark:text-white">
                {professional.name}
              </p>
              {professional.bio ? (
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-stone-400">
                  {professional.bio}
                </p>
              ) : null}
            </div>
          </div>
        </RadioCard>
      ))}
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { WorkingHoursEditor } from "./WorkingHoursEditor";
import { ServiceLinks } from "./ServiceLinks";
import { TimeBlocksManager } from "./TimeBlocksManager";
import { ProfessionalProfileHeader } from "./ProfessionalProfileHeader";
import { ProfessionalPhoto } from "./ProfessionalPhoto";
import { HowItWorks, FieldHint } from "@/components/ui/HowItWorks";
import type { WorkingHoursInterval } from "./actions";

interface ProfessionalDetail {
  id: string;
  bio: string | null;
  photoUrl: string | null;
  isActive: boolean;
  user: { name: string; email: string };
  workingHours: { weekday: string; startMinute: number; endMinute: number }[];
}

interface ServiceOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface ProfessionalServiceLink {
  serviceId: string;
  isActive: boolean;
}

interface TimeBlockItem {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export default async function ProfessionalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const canManage = session?.user.role === "OWNER";
  const canViewOwnSchedule = session?.user.professionalId === id;

  if (!canManage && !canViewOwnSchedule) {
    return (
      <div>
        <p className="text-sm text-zinc-500 dark:text-stone-400">
          Você não tem acesso a esta página.
        </p>
      </div>
    );
  }

  const [professional, services, links, blocks] = await Promise.all([
    authedFetch<ProfessionalDetail>(`/professionals/${encodeURIComponent(id)}`),
    authedFetch<ServiceOption[]>("/services"),
    authedFetch<ProfessionalServiceLink[]>(`/professionals/${encodeURIComponent(id)}/services`),
    authedFetch<TimeBlockItem[]>(`/time-blocks?professionalId=${encodeURIComponent(id)}`),
  ]);

  const linkedServiceIds = links.filter((link) => link.isActive).map((link) => link.serviceId);
  const activeServices = services.filter((service) => service.isActive);

  const workingHoursForEditor: WorkingHoursInterval[] = professional.workingHours.map((wh) => ({
    weekday: wh.weekday,
    startMinute: wh.startMinute,
    endMinute: wh.endMinute,
  }));

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link
        href="/dashboard/profissionais"
        className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <ArrowLeft size={16} />
        Profissionais
      </Link>

      <ProfessionalProfileHeader
        professionalId={id}
        name={professional.user.name}
        email={professional.user.email}
        bio={professional.bio}
        canManage={canManage}
      />

      <ProfessionalPhoto professionalId={id} name={professional.user.name} photoUrl={professional.photoUrl} />

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-5 xl:col-span-4">
          <HowItWorks>
            <p>Aqui você define <strong>quando este profissional atende</strong> e o que ele faz.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Horário de trabalho:</strong> a jornada fixa de cada dia da semana. É ela que define os horários livres que o cliente vê ao agendar.</li>
              <li><strong>Serviços que realiza:</strong> o cliente só consegue marcar com ele os serviços marcados aqui.</li>
              <li><strong>Bloqueios:</strong> exceções pontuais (folga, consulta, férias) que tiram um horário específico da agenda, sem mexer na jornada fixa.</li>
            </ul>
          </HowItWorks>

          <section>
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
              Horário de trabalho
            </h2>
            <FieldHint>
              Para cada dia, informe de que horas até que horas ele atende. “Não atende” significa folga fixa.
              Para um intervalo de almoço, cadastre dois horários no mesmo dia (ex.: 09:00–12:00 e 13:30–18:00).
              Só vale depois de clicar em “Salvar horários”.
            </FieldHint>
            <div className="mt-3">
              <WorkingHoursEditor professionalId={id} initialIntervals={workingHoursForEditor} />
            </div>
          </section>

          {canManage ? (
            <section>
              <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                Serviços que realiza
              </h2>
              <FieldHint>Marque os serviços que ele faz; só serviços ativos aparecem. A marcação vale na hora.</FieldHint>
              <div className="mt-3">
                <ServiceLinks
                  professionalId={id}
                  services={activeServices}
                  linkedServiceIds={linkedServiceIds}
                />
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col lg:col-span-7 xl:col-span-8">
          <section>
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
              Bloqueios (folga, almoço, férias)
            </h2>
            <FieldHint>
              Tira um período pontual da agenda deste profissional. Não dá para bloquear um horário que já tem
              atendimento marcado: cancele ou remarque o atendimento antes.
            </FieldHint>
            <div className="mt-3">
              <TimeBlocksManager professionalId={id} blocks={blocks} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

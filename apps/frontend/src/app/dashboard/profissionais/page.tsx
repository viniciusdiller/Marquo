import { Users } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { CreateProfessionalForm } from "./CreateProfessionalForm";
import { ProfessionalRow } from "./ProfessionalRow";

interface AdminProfessional {
  id: string;
  isActive: boolean;
  photoUrl: string | null;
  // email ausente quando quem pede é PROFESSIONAL (backend só devolve e-mail de colega pro
  // dono/recepção — ver professionals.service.ts findAllByTenant).
  user: { id: string; name: string; email?: string };
}

export default async function ProfessionalsPage() {
  const session = await auth();
  const isOwner = session?.user.role === "OWNER";

  const professionals = await authedFetch<AdminProfessional[]>("/professionals").catch(() => []);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Profissionais"
        description="Cada profissional tem a própria agenda e horário de trabalho."
      />

      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <HowItWorks>
            <p>
              Cada profissional tem <strong>login próprio</strong>, uma agenda separada e os seus
              horários de trabalho.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Em <strong>Gerenciar</strong> você define os horários de trabalho, as folgas e quais serviços ele atende.</li>
              <li>O profissional entra com o e-mail e a senha inicial que você cadastrar e vê só a própria agenda.</li>
              <li><strong>Desativar</strong> tira a pessoa dos novos agendamentos. Não dá para desativar quem tem atendimento futuro marcado: remarque ou cancele antes.</li>
              <li>O número de profissionais ativos é limitado pelo seu plano.</li>
            </ul>
          </HowItWorks>

          {isOwner ? (
            <div>
              <CreateProfessionalForm />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col">
          {professionals.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum profissional cadastrado ainda"
              description={
                isOwner
                  ? "Use o formulário ao lado pra cadastrar o primeiro."
                  : "Peça pro dono do negócio cadastrar a equipe."
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
              {professionals.map((professional, i) => (
                <ProfessionalRow
                  key={professional.id}
                  id={professional.id}
                  name={professional.user.name}
                  photoUrl={professional.photoUrl}
                  email={professional.user.email}
                  isActive={professional.isActive}
                  canManage={isOwner}
                  index={i}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

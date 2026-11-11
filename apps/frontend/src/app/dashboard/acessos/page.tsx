import type { AccessProfileSummary, AccessUserSummary } from "@marquo/shared-types";
import { authedFetch } from "@/lib/api-server";
import { requireOwner } from "@/lib/access-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { AccessManager } from "./AccessManager";

export default async function AccessPage() {
  await requireOwner();

  const [profiles, users] = await Promise.all([
    authedFetch<AccessProfileSummary[]>("/access/profiles").catch(() => null),
    authedFetch<AccessUserSummary[]>("/access/users").catch(() => null),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Perfis e acessos"
        description="Crie perfis (ex.: caixa) e escolha o que cada pessoa da equipe pode ver e editar no painel."
      />
      <div className="mt-6 flex flex-col gap-6">
        <HowItWorks>
          <p>
            Um <strong>perfil</strong> define, tela por tela, se a pessoa <strong>não vê</strong>, <strong>só vê</strong> ou{" "}
            <strong>vê e edita</strong>. Depois é só criar a pessoa e escolher o perfil dela.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Mudar um perfil vale <strong>na hora</strong> para todo mundo que usa ele.</li>
            <li>Plano e cobrança, Configurações e esta tela são <strong>sempre só do dono</strong>.</li>
            <li>Quem atende (tem agenda própria) é cadastrado em <strong>Profissionais</strong>; aqui você escolhe o perfil dele.</li>
            <li>Profissionais só enxergam os próprios dados na agenda, mesmo com acesso à tela.</li>
          </ul>
        </HowItWorks>
        {profiles && users ? (
          <AccessManager profiles={profiles} users={users} />
        ) : (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Não foi possível carregar os perfis agora. Tente novamente em instantes.
          </p>
        )}
      </div>
    </div>
  );
}

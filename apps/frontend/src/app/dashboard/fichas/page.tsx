import type { IntakeFormSummary } from "@marquo/shared-types";
import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { requireRole } from "@/lib/guards";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { FormsManager } from "./FormsManager";

export default async function FichasPage() {
  const session = await auth();
  requireRole(session, ["OWNER"]);

  const forms = await authedFetch<IntakeFormSummary[]>("/intake/forms").catch(() => []);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Fichas de anamnese"
        description="Modelos de ficha preenchidos por cliente na tela de cada cliente."
      />

      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <HowItWorks defaultOpen={forms.length === 0}>
            <p>
              Ficha de anamnese é um <strong>questionário que você monta uma vez</strong> e a
              equipe preenche na ficha de cada cliente (substitui a prancheta de papel).
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Crie um modelo (ex.: “Anamnese capilar”) e adicione as perguntas. Cada pergunta é um campo: texto, sim/não ou lista de opções.</li>
              <li>O profissional preenche em <strong>Clientes → (cliente) → Fichas</strong>. Cada cliente tem uma resposta por modelo; ao editar, ela é atualizada.</li>
              <li>Modelo inativo não aparece mais para preencher, mas as respostas já salvas ficam guardadas.</li>
              <li>O preenchimento é feito pela equipe: o cliente não responde sozinho.</li>
              <li>Respostas de saúde são dado sensível: pergunte só o que for necessário para o atendimento.</li>
            </ul>
          </HowItWorks>
        </div>
        
        <div className="flex min-w-0 flex-col">
          <FormsManager initialForms={forms} />
        </div>
      </div>
    </div>
  );
}

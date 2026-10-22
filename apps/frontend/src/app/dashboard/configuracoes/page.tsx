import { auth } from "@/lib/auth";
import { authedFetch } from "@/lib/api-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { TenantProfileSettingsForm } from "./TenantProfileSettingsForm";
import { GalleryManager } from "./GalleryManager";
import { ExportDataCard } from "./ExportDataCard";

interface TenantMe {
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  businessHours: string | null;
  logoUrl: string | null;
  updatedAt: string;
  accentColor: string | null;
  whatsappNumber: string | null;
  instagramUrl: string | null;
  showServices: boolean;
  showTeam: boolean;
  showGallery: boolean;
  showContact: boolean;
  galleryImages: { id: string; url: string }[];
  minSchedulingLeadTimeMinutes: number;
  maxSchedulingLeadTimeDays: number;
}

export default async function ConfiguracoesPage() {
  const session = await auth();
  const isOwner = session?.user.role === "OWNER";

  if (!isOwner) {
    return (
      <p className="text-sm text-zinc-500 dark:text-stone-400">
        Só o dono do negócio pode editar essas configurações.
      </p>
    );
  }

  const tenant = await authedFetch<TenantMe>("/tenants/me");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Configurações"
        description={
          <>
            Como seu negócio aparece em{" "}
            <span className="font-medium text-zinc-700 dark:text-stone-200">
              marquo.com.br/{tenant.slug}
            </span>
            .
          </>
        }
      />

      <HowItWorks>
        <p>
          Esta tela controla <strong>o que o cliente vê na sua página pública</strong>, a que
          ele abre para agendar.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Descrição, endereço, horário e contatos aparecem na página. WhatsApp e Instagram viram botões.</li>
          <li><strong>Seções visíveis</strong> liga e desliga blocos (serviços, equipe, galeria, contato). Uma seção só aparece se tiver conteúdo cadastrado.</li>
          <li>A <strong>galeria</strong> aceita até 12 fotos. Passe o mouse numa foto para removê-la.</li>
          <li>Esta tela não altera plano nem cobrança; isso fica em Plano e cobrança.</li>
        </ul>
      </HowItWorks>

      <div className="mt-6 flex flex-col gap-8">
        <TenantProfileSettingsForm tenant={tenant} />
        <GalleryManager images={tenant.galleryImages} />
        <ExportDataCard />
      </div>
    </div>
  );
}

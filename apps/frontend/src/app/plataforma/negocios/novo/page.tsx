import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewTenantForm } from "./NewTenantForm";

export default function NovoNegocioPage() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <Link
          href="/plataforma/negocios"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
        >
          <CaretLeft size={14} />
          Negócios
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Novo negócio"
            description="Cria a barbearia/salão e a conta do dono. O dono define a própria senha por um link."
          />
        </div>
      </div>
      <NewTenantForm />
    </div>
  );
}

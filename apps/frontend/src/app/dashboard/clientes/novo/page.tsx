import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { requireArea } from "@/lib/access-server";
import { ClientForm } from "../ClientForm";
import { createClientAction } from "../actions";

export default async function NewClientPage() {
  await requireArea("clientes", "EDIT");

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
      >
        <CaretLeft size={14} />
        Clientes
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-zinc-900 dark:text-white">
        Novo cliente
      </h1>

      <div className="mt-6">
        <ClientForm action={createClientAction} submitLabel="Cadastrar" />
      </div>
    </div>
  );
}

import Link from "next/link";

export default function TenantNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center dark:bg-zinc-950">
      <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">
        Negócio não encontrado
      </h1>
      <p className="max-w-sm text-[15px] text-zinc-600 dark:text-stone-300">
        Confira se o link está correto ou fale com o negócio que te enviou
        esse endereço.
      </p>
      <Link
        href="/"
        className="mt-2 text-sm font-semibold text-accent-600 hover:text-accent-700 dark:text-accent-300"
      >
        Voltar para o Marquo
      </Link>
    </main>
  );
}

// Link comum (<a download>), não <Link>: a resposta é um arquivo, não uma página do app, e a navegação do Next não
// sabe baixar arquivo.
export function ExportDataCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Seus dados</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
        Baixe uma cópia de tudo que está no seu negócio: clientes, agendamentos, comandas, produtos, financeiro e
        fichas. O arquivo é um JSON e fica só com você. Para clientes que registraram dados de saúde nas fichas, guarde
        o arquivo com cuidado.
      </p>
      <a
        href="/dashboard/configuracoes/exportar"
        download
        className="mt-4 inline-flex items-center justify-center rounded-full bg-transparent px-5 py-2.5 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-900/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-white dark:ring-white/20 dark:hover:bg-white/10"
      >
        Baixar meus dados (JSON)
      </a>
    </div>
  );
}

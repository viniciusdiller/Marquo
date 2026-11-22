// Link comum (<a download>), não <Link>: a resposta é um arquivo, não uma página do app, e a navegação do Next não
// sabe baixar arquivo.
export function ExportDataCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Seus dados</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
        Baixe uma cópia de tudo que está no seu negócio: clientes, agendamentos, comandas, produtos, financeiro e
        fichas. A planilha abre no Excel ou no Google Planilhas, com uma aba para cada assunto; o JSON serve para levar os
        dados para outro sistema. O arquivo fica só com você: para clientes que registraram dados de saúde nas fichas,
        guarde-o com cuidado.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
      <a
        href="/dashboard/configuracoes/exportar?formato=planilha"
        download
        className="inline-flex items-center justify-center rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        Baixar planilha (Excel)
      </a>
      <a
        href="/dashboard/configuracoes/exportar"
        download
        className="inline-flex items-center justify-center rounded-full bg-transparent px-5 py-2.5 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-900/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-white dark:ring-white/20 dark:hover:bg-white/10"
      >
        Baixar em JSON
      </a>
      </div>
    </div>
  );
}

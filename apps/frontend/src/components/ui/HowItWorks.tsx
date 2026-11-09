import type { ReactNode } from "react";
import { CaretDown, Info } from "@phosphor-icons/react/dist/ssr";

// Explicação fixa de uma tela ("pra que serve, como usar"). <details> nativo: abre/fecha sem
// JS, funciona em Server Component e é acessível por teclado. Sempre fechado por padrão para
// manter a tela limpa e não empurrar o conteúdo de trabalho.
export function HowItWorks({
  title = "Como funciona",
  defaultOpen = false,
  children,
}: {
  title?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group mt-4 rounded-xl border border-accent-100 bg-accent-50/60 text-sm dark:border-accent-500/20 dark:bg-accent-500/5"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-medium text-accent-700 select-none dark:text-accent-300 [&::-webkit-details-marker]:hidden">
        <Info size={16} weight="bold" />
        {title}
        <CaretDown
          size={14}
          weight="bold"
          className="ml-auto transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="space-y-2 px-4 pb-3.5 leading-relaxed text-zinc-600 dark:text-stone-300">
        {children}
      </div>
    </details>
  );
}

// Dica curta sob um campo de formulário: o que ele faz e o que acontece com o valor.
export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-snug text-zinc-400 dark:text-stone-500">{children}</p>;
}

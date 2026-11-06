import { ThemeToggle } from "./ThemeToggle";

// Alternador de tema sempre à mão em qualquer página (montado uma vez no layout raiz). Botão
// sólido na cor da marca, com anel, pra não se perder no canto da tela. Abaixo dos modais
// (z-50) pra nunca cobrir um diálogo aberto.
export function FloatingThemeToggle() {
  return (
    <div className="[body:has([data-site-header])_&]:max-sm:hidden fixed right-4 bottom-4 z-40 rounded-full bg-accent-500 p-1 shadow-xl shadow-accent-500/40 ring-4 ring-white/80 print:hidden dark:ring-zinc-900/80">
      <ThemeToggle className="h-11! w-11! text-white! hover:bg-white/20! hover:text-white!" iconSize={22} />
    </div>
  );
}

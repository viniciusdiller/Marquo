import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { PublicTenant } from "@marquo/shared-types";
import { Logo } from "../brand/Logo";
import { Container } from "../ui/Container";

// Rodapé próprio de /[slug]/* — components/marketing/Footer.tsx (o "footer padrão")
// é o da landing, com "Começar grátis" mirando dono de negócio; num cliente final
// fechando um agendamento isso é ruído fora de contexto. Aqui a marca Marquo
// tem mais peso visual que a assinatura discreta do header (é o rodapé de toda
// página do cliente, não só da home do tenant), mas o conteúdo é falado pro cliente
// final: conta, não upsell de SaaS.
export function TenantFooter({ tenant }: { tenant: PublicTenant }) {
  return (
    <footer className="border-t border-zinc-200 py-12 dark:border-white/10">
      <Container className="flex flex-col items-center gap-5 text-center">
        <Logo markSize={26} />

        <p className="max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-stone-400">
          {tenant.name} usa o Marquo pra organizar os agendamentos. Seu horário e
          seu histórico ficam guardados na sua conta de cliente.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <Link
            href={`/entrar?next=${encodeURIComponent(`/${tenant.slug}`)}`}
            className="font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-stone-300 dark:hover:text-white"
          >
            Entrar na minha conta
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex items-center gap-1 font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-stone-300 dark:hover:text-white"
          >
            Tem um salão ou barbearia?
            <ArrowUpRight size={13} />
          </Link>
        </div>

        <p className="text-xs text-zinc-400 dark:text-stone-500">
          © {new Date().getFullYear()} Marquo
        </p>
      </Container>
    </footer>
  );
}

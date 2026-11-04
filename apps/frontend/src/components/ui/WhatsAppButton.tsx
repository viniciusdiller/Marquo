import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import { whatsappLink } from "@/lib/whatsapp";

// Abre a conversa do WhatsApp com o cliente (wa.me) numa aba nova: o painel do dono continua aberto. O telefone vem do
// cadastro e `whatsappLink` só monta o link para um número brasileiro plausível: sem número válido o botão some em vez de
// apontar para lugar nenhum. É só um link (nada é enviado por nós): o dono escreve a mensagem no próprio WhatsApp.
export function WhatsAppButton({
  phone,
  name,
  label,
  className,
}: {
  phone: string | null | undefined;
  name: string;
  // Com `label` mostra o texto ao lado do ícone; sem, só o ícone (listas).
  label?: string;
  className?: string;
}) {
  const href = whatsappLink(phone);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chamar ${name} no WhatsApp`}
      title="Chamar no WhatsApp"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-emerald-700 ring-1 ring-emerald-300 ring-inset transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-500/40 dark:hover:bg-emerald-500/10",
        label ? "px-3.5 py-2 text-sm font-semibold" : "size-9",
        className,
      )}
    >
      <WhatsappLogo size={label ? 18 : 20} weight="fill" />
      {label}
    </a>
  );
}

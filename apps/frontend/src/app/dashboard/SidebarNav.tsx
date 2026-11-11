"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { motion } from "motion/react";
import type { AccessAreaKey, AccessPermissions } from "@marquo/shared-types";
import { canAccess } from "@/lib/access";
import {
  CalendarBlank,
  CashRegister,
  ChartLineUp,
  ChartPieSlice,
  ClipboardText,
  ClockCounterClockwise,
  CreditCard,
  Crown,
  Gear,
  IdentificationCard,
  ShieldCheck,
  Package,
  Percent,
  Receipt,
  Scissors,
  Storefront,
  Users,
} from "@phosphor-icons/react/dist/ssr";

interface NavLink {
  href: string;
  label: string;
  icon: typeof CalendarBlank;
  // Tooltip no hover (title nativo) — só ícone + nome não dizia pra que cada tela serve;
  // "Comissões" e "Marketplace" são os exemplos mais confusos, mas o gap era geral.
  description: string;
  // Área de acesso que libera o item. `owner` = só o dono (Plano, Configurações, Acessos).
  area?: AccessAreaKey;
  owner?: true;
}

// Agrupado por fluxo de trabalho (não ordem alfabética) — com 14 destinos, uma lista plana
// vira uma parede de texto; o dono escaneia por "o que eu vim fazer agora", não por nome.
const sections: { label: string; links: NavLink[] }[] = [
  {
    label: "Operação do dia",
    links: [
      {
        href: "/dashboard/agenda",
        area: "agenda",
        label: "Agenda",
        icon: CalendarBlank,
        description: "Calendário de horários e atendimentos do dia",
      },
      {
        href: "/dashboard/comandas",
        area: "comandas",
        label: "Comandas",
        icon: Receipt,
        description: "Conta de um atendimento — itens, pagamentos e fechamento",
      },
      {
        href: "/dashboard/caixa",
        area: "caixa",
        label: "Caixa",
        icon: CashRegister,
        description: "Abertura, sangria/suprimento e fechamento do caixa do dia",
      },
      {
        href: "/dashboard/lista-espera",
        area: "lista_espera",
        label: "Lista de espera",
        icon: ClockCounterClockwise,
        description: "Clientes esperando vaga quando a agenda está cheia",
      },
    ],
  },
  {
    label: "Clientes",
    links: [
      {
        href: "/dashboard/clientes",
        area: "clientes",
        label: "Clientes",
        icon: IdentificationCard,
        description: "Cadastro, histórico e contato dos seus clientes",
      },
      {
        href: "/dashboard/fichas",
        area: "fichas",
        label: "Fichas",
        icon: ClipboardText,
        description: "Formulários personalizados pra preencher no atendimento (ex.: anamnese)",
      },
      {
        href: "/dashboard/clube",
        area: "clube",
        label: "Clube",
        icon: Crown,
        description: "Pacotes mensais para seus clientes (ex.: 4 cortes por mês)",
      },
    ],
  },
  {
    label: "Catálogo",
    links: [
      {
        href: "/dashboard/servicos",
        area: "servicos",
        label: "Serviços",
        icon: Scissors,
        description: "Catálogo de serviços, preço e duração",
      },
      {
        href: "/dashboard/produtos",
        area: "produtos",
        label: "Produtos",
        icon: Package,
        description: "Catálogo e estoque dos produtos vendidos",
      },
    ],
  },
  {
    label: "Equipe e financeiro",
    links: [
      {
        href: "/dashboard/profissionais",
        area: "profissionais",
        label: "Profissionais",
        icon: Users,
        description: "Equipe, horários de trabalho e serviços que cada um atende",
      },
      {
        href: "/dashboard/acessos",
        owner: true,
        label: "Perfis e acessos",
        icon: ShieldCheck,
        description: "Crie perfis (ex.: caixa) e escolha o que cada pessoa da equipe pode ver e editar",
      },
      {
        href: "/dashboard/comissoes",
        area: "comissoes",
        label: "Comissões",
        icon: Percent,
        description: "Regras de comissão por profissional sobre o que é vendido",
      },
      {
        href: "/dashboard/financeiro",
        area: "financeiro",
        label: "Financeiro",
        icon: ChartLineUp,
        description: "Contas a pagar/receber, fluxo de caixa e resultado do negócio",
      },
      {
        href: "/dashboard/relatorios",
        area: "relatorios",
        label: "Relatórios",
        icon: ChartPieSlice,
        description: "Balanço geral de serviços realizados e produtos vendidos",
      },
    ],
  },
  {
    label: "Negócio",
    links: [
      {
        href: "/dashboard/marketplace",
        area: "marketplace",
        label: "Marketplace",
        icon: Storefront,
        description: "Apareça pra novos clientes buscando salão perto deles",
      },
      {
        href: "/dashboard/plano",
        owner: true,
        label: "Plano e cobrança",
        icon: CreditCard,
        description: "Seu plano, pagamento e troca de assinatura",
      },
      {
        href: "/dashboard/configuracoes",
        owner: true,
        label: "Configurações",
        icon: Gear,
        description: "Dados públicos do negócio: logo, endereço, contato e galeria",
      },
    ],
  },
];

interface SidebarNavProps {
  onNavigate?: () => void;
  // O <aside> desktop fica montado no DOM mesmo escondido por CSS no mobile (hidden md:block
  // não desmonta). Com o drawer mobile renderizando outra instância ao mesmo tempo, duas
  // <motion.span layoutId="sidebar-active"> simultâneas faziam o motion tentar animar UMA
  // pill entre os dois lugares — e travava a entrada do drawer e do backdrop junto.
  scope?: "desktop" | "mobile";
  // Sem `access`, mostra tudo (testes e telas sem sessão); o layout sempre informa.
  access?: { isOwner: boolean; permissions: AccessPermissions };
}

export function SidebarNav({ onNavigate, scope = "desktop", access }: SidebarNavProps) {
  const pathname = usePathname();
  const visible = (link: NavLink) => {
    if (!access) return true;
    if (link.owner) return access.isOwner;
    return link.area ? canAccess(access, link.area) : false;
  };

  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => ({ ...section, links: section.links.filter(visible) })).filter((section) => section.links.length > 0).map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-stone-500">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.links.map((link) => {
              const isActive = Boolean(
                pathname && (pathname === link.href || pathname.startsWith(`${link.href}/`)),
              );
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onNavigate}
                  title={link.description}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "text-accent-700 dark:text-accent-300"
                      : "text-zinc-600 hover:bg-zinc-900/5 dark:text-stone-300 dark:hover:bg-white/5",
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId={`sidebar-active-${scope}`}
                      aria-hidden
                      className="absolute inset-0 rounded-xl bg-accent-50 dark:bg-accent-500/10"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  ) : null}
                  <link.icon size={18} weight={isActive ? "fill" : "regular"} className="relative" />
                  <span className="relative">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

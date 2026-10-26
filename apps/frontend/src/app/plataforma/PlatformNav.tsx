"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITEMS = [
  { href: "/plataforma", label: "Visão geral", exact: true },
  { href: "/plataforma/negocios", label: "Negócios" },
  { href: "/plataforma/testes", label: "Testes grátis" },
  { href: "/plataforma/assinaturas", label: "Assinaturas" },
  { href: "/plataforma/precos", label: "Preços" },
  { href: "/plataforma/cupons", label: "Cupons" },
  { href: "/plataforma/usuarios", label: "Usuários" },
  { href: "/plataforma/exclusao", label: "Exclusão de dados" },
  { href: "/plataforma/auditoria", label: "Auditoria" },
];

export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções da plataforma" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-accent-500 text-accent-700 dark:text-accent-300"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

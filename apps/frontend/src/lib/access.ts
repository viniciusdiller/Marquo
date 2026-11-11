import {
  type AccessAreaKey,
  type AccessLevel,
  type AccessMe,
  type AccessPermissions,
  defaultPermissionsForRole,
  levelAtLeast,
  normalizePermissions,
} from "@marquo/shared-types";

// Lógica PURA de acesso do painel (sem rede), compartilhada por menu, páginas e testes.
// É só conforto de tela: quem decide de verdade é o backend (AreaGuard) em cada requisição.

export function canAccess(access: Pick<AccessMe, "permissions" | "isOwner">, area: AccessAreaKey, level: AccessLevel = "VIEW"): boolean {
  if (access.isOwner) return true;
  return levelAtLeast(access.permissions[area], level);
}

// Quando a leitura de /access/me falha, cai no perfil padrão do papel (o backend segue mandando).
export function fallbackAccess(role: AccessMe["role"]): AccessMe {
  return {
    role,
    isOwner: role === "OWNER",
    profileName: null,
    permissions: normalizePermissions(defaultPermissionsForRole(role)),
  };
}

// Ordem em que o painel procura a primeira tela liberada para quem acabou de entrar.
const LANDING_ORDER: { area: AccessAreaKey; href: string }[] = [
  { area: "agenda", href: "/dashboard/agenda" },
  { area: "comandas", href: "/dashboard/comandas" },
  { area: "caixa", href: "/dashboard/caixa" },
  { area: "lista_espera", href: "/dashboard/lista-espera" },
  { area: "clientes", href: "/dashboard/clientes" },
  { area: "fichas", href: "/dashboard/fichas" },
  { area: "clube", href: "/dashboard/clube" },
  { area: "servicos", href: "/dashboard/servicos" },
  { area: "produtos", href: "/dashboard/produtos" },
  { area: "profissionais", href: "/dashboard/profissionais" },
  { area: "comissoes", href: "/dashboard/comissoes" },
  { area: "financeiro", href: "/dashboard/financeiro" },
  { area: "relatorios", href: "/dashboard/relatorios" },
  { area: "marketplace", href: "/dashboard/marketplace" },
];

export function firstAllowedHref(access: Pick<AccessMe, "permissions" | "isOwner">): string | null {
  return LANDING_ORDER.find((l) => canAccess(access, l.area))?.href ?? null;
}

export type { AccessPermissions };

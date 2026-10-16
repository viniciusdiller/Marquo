// Cookie de sessão da conta da plataforma (painel de gestão da empresa). Terceira identidade, separada
// da sessão NextAuth de staff e do cookie `ta_consumer`. Sessão curta e SEM renovação: o proxy não a
// estende de propósito (é uma conta que enxerga todos os negócios).
export const PLATFORM_COOKIE_NAME = "ta_platform";

export function platformCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // strict: o cookie nunca acompanha navegação vinda de outro site (reduz CSRF nas ações do painel).
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

import Link from "next/link";
import type { Metadata } from "next";
import { SetPasswordForm } from "./SetPasswordForm";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/marketing/Footer";
import { BackLink } from "@/components/ui/BackLink";
import { BrandPattern } from "@/components/brand/BrandPattern";
import { backendFetch } from "@/lib/backend-fetch";

export const metadata: Metadata = { title: "Definir senha - Marquo" };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function checkToken(token: string): Promise<{ name: string } | null> {
  const response = await backendFetch(`${API_URL}/auth/set-password/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await checkToken(token) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="relative isolate flex flex-1 items-center justify-center bg-stone-50 px-6 py-16 dark:bg-zinc-950">
        <BrandPattern mask="radial-gradient(ellipse 55% 60% at 50% 50%, transparent 30%, black 100%)" />
        <div className="w-full max-w-sm">
          <BackLink href="/entrar" label="Voltar ao login" />
          <Link href="/" className="mt-4 block">
            <Logo />
          </Link>
          <h1 className="mt-6 font-display text-2xl font-bold text-zinc-900 dark:text-white">
            Definir senha
          </h1>

          {invite && token ? (
            <>
              <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
                Bem-vindo(a), {invite.name}. Escolha uma senha para acessar sua agenda.
              </p>
              <div className="mt-8">
                <SetPasswordForm token={token} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
              Este link para definir senha é inválido ou expirou. Se sua assinatura já foi
              confirmada, entre em contato com o suporte para receber um novo link.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

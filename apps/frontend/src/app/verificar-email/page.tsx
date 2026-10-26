import Link from "next/link";
import type { Metadata } from "next";
import { VerifyEmailForm } from "./VerifyEmailForm";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/marketing/Footer";
import { BackLink } from "@/components/ui/BackLink";
import { BrandPattern } from "@/components/brand/BrandPattern";

export const metadata: Metadata = { title: "Confirmar e-mail - Marquo", robots: { index: false } };

export default async function VerificarEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="relative isolate flex flex-1 items-center justify-center bg-stone-50 px-6 py-16 dark:bg-zinc-950">
        <BrandPattern mask="radial-gradient(ellipse 55% 60% at 50% 50%, transparent 30%, black 100%)" />
        <div className="w-full max-w-sm">
          <BackLink href="/entrar" label="Voltar ao login" />
          <Link href="/" className="mt-4 block">
            <Logo />
          </Link>
          <h1 className="mt-6 font-display text-2xl font-bold text-zinc-900 dark:text-white">Confirmar e-mail</h1>
          <div className="mt-8">
            {token ? (
              <VerifyEmailForm token={token} />
            ) : (
              <p className="text-sm text-zinc-500 dark:text-stone-400">
                Este link é inválido. Peça um novo na tela de entrada, em &quot;Reenviar e-mail de confirmação&quot;.
              </p>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

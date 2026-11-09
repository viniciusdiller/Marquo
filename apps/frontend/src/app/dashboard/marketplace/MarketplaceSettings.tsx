"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeSlash,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import clsx from "clsx";
import type { MarketplaceSettings as Settings } from "@marquo/shared-types";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { AddressLocationPicker } from "@/components/dashboard/AddressLocationPicker";
import {
  saveMarketplaceAction,
  toggleMarketplaceListingAction,
  type MarketplaceActionState,
} from "./actions";

const initial: MarketplaceActionState = {};

export function MarketplaceSettings({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState(saveMarketplaceAction, initial);
  const [isListed, setIsListed] = useState(settings.listedInMarketplace);
  const [togglePending, setTogglePending] = useState(false);
  const [toggleFeedback, setToggleFeedback] = useState<{ ok?: boolean; error?: string } | null>(null);

  async function handleToggle(next: boolean) {
    setIsListed(next);
    setTogglePending(true);
    setToggleFeedback(null);

    const res = await toggleMarketplaceListingAction(next);
    setTogglePending(false);

    if (res.error) {
      setIsListed(!next);
      setToggleFeedback({ error: res.error });
    } else {
      setToggleFeedback({ ok: true });
    }
  }

  return (
    <form action={formAction} className="mt-4 space-y-6">
      <input type="hidden" name="listed" value={isListed ? "on" : ""} />

      {/* Card de Visibilidade no Marketplace */}
      <div
        className={clsx(
          "rounded-2xl border p-5 transition-colors",
          isListed
            ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/10"
            : "border-zinc-200 bg-zinc-50/60 dark:border-white/10 dark:bg-zinc-900/40",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={clsx(
                "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                isListed
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                  : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-stone-400",
              )}
            >
              {isListed ? <Eye size={22} weight="bold" /> : <EyeSlash size={22} weight="bold" />}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Visibilidade na busca pública do Marquo
                </h3>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                    isListed
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-stone-300",
                  )}
                >
                  {isListed ? "Visível para novos clientes" : "Apenas com link direto"}
                </span>
                {togglePending ? (
                  <span className="text-xs text-zinc-400 dark:text-stone-500 animate-pulse">
                    Salvando...
                  </span>
                ) : toggleFeedback?.ok ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Salvo!
                  </span>
                ) : null}
              </div>

              <p className="max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-stone-300">
                {isListed
                  ? "Seu negócio aparece para pessoas procurando barbearias e salões na sua região pelo Marquo. Novos clientes podem te encontrar e agendar online."
                  : "Seu negócio não aparece nos resultados da busca do Marquo. Apenas quem já possui o seu link direto (na bio do Instagram, WhatsApp ou enviado por você) consegue marcar horário."}
              </p>

              {toggleFeedback?.error && (
                <p className="pt-1 text-xs font-semibold text-red-600 dark:text-red-400">
                  {toggleFeedback.error}
                </p>
              )}
            </div>
          </div>

          {/* Switch acessível com auto-save */}
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              name="listed_toggle"
              checked={isListed}
              disabled={togglePending}
              onChange={(e) => handleToggle(e.target.checked)}
              className="peer sr-only"
              aria-label="Ativar visibilidade na busca pública"
            />
            <div className="peer h-6 w-11 rounded-full bg-zinc-300 transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-60 dark:bg-zinc-700 dark:peer-focus-visible:ring-offset-zinc-950" />
          </label>
        </div>

        {/* Rodapé do Card com apenas o link para a página pública */}
        <div className="mt-4 flex items-center justify-end border-t border-zinc-200/70 pt-3 text-xs dark:border-white/10">
          <Link
            href="/descobrir"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent-600 hover:text-accent-700 hover:underline dark:text-accent-400 dark:hover:text-accent-300"
          >
            Ver página de busca
            <ArrowSquareOut size={13} weight="bold" />
          </Link>
        </div>
      </div>

      <AddressLocationPicker
        initialAddress={settings.address}
        initialCity={settings.city}
        initialNeighborhood={settings.neighborhood}
        initialLatitude={settings.latitude}
        initialLongitude={settings.longitude}
      />

      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-stone-200">
        <span className="flex items-center gap-1.5">
          Faixa de preço
          <FieldHelp title="Faixa de Preço">
            $ é mais econômico e $$$$ é alta classe/luxo. Aparece no cartão do seu salão no marketplace.
          </FieldHelp>
        </span>
        <select
          name="priceRange"
          defaultValue={settings.priceRange ?? ""}
          className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
        >
          <option value="">—</option>
          <option value="1">$</option>
          <option value="2">$$</option>
          <option value="3">$$$</option>
          <option value="4">$$$$</option>
        </select>
        <span className="text-xs font-normal text-zinc-400 dark:text-stone-500">$ é mais em conta, $$$$ é premium. Aparece no cartão do resultado.</span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-zinc-700 dark:text-stone-200">
          <span className="flex items-center gap-1.5">
            Categorias (até 6)
            <FieldHelp title="Categorias no Marketplace">
              Selecione os tipos de serviços que seu salão realiza para ser encontrado por clientes que filtram por especialidade.
            </FieldHelp>
          </span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {settings.availableCategories.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 text-sm text-zinc-600 dark:text-stone-300"
            >
              <input
                type="checkbox"
                name="categorySlugs"
                value={c.slug}
                defaultChecked={settings.categorySlugs.includes(c.slug)}
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600 dark:text-emerald-400">Salvo.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

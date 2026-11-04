"use client";

import { useActionState } from "react";
import type { MarketplaceSettings as Settings } from "@marquo/shared-types";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { Input } from "@/components/ui/Input";
import { saveMarketplaceAction, type MarketplaceActionState } from "./actions";

const initial: MarketplaceActionState = {};

export function MarketplaceSettings({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState(saveMarketplaceAction, initial);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-stone-200">
          <input type="checkbox" name="listed" defaultChecked={settings.listedInMarketplace} />
          Aparecer no marketplace de descoberta (/descobrir)
          <FieldHelp title="Marketplace de Descoberta">
            Quando ativo, clientes que usam a busca geral do Marquo conseguem encontrar seu salão
            por proximidade e categorias de serviços oferecidos.
          </FieldHelp>
        </label>
        <p className="mt-1 text-xs text-zinc-400 dark:text-stone-500">
          É opcional e vem desligado por padrão. Só muda quem consegue te encontrar
          buscando por serviço/cidade — não afeta seu plano nem cobrança.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Cidade" name="city" maxLength={120} autoComplete="address-level2" defaultValue={settings.city ?? ""} hint="É o que o cliente filtra na busca." />
        <Input label="Bairro" name="neighborhood" maxLength={120} defaultValue={settings.neighborhood ?? ""} hint="Opcional, ajuda a achar quem está perto." />
        <Input
          label={
            <span className="flex items-center gap-1.5">
              Latitude
              <FieldHelp title="Latitude">
                Coordenada geográfica Norte/Sul. Usada com a longitude para ordenar salões pela proximidade no marketplace.
              </FieldHelp>
            </span>
          }
          name="latitude"
          inputMode="decimal"
          defaultValue={settings.latitude ?? ""}
          hint="Opcional — usada para ordenar por distância."
        />
        <Input
          label={
            <span className="flex items-center gap-1.5">
              Longitude
              <FieldHelp title="Longitude">
                Coordenada geográfica Leste/Oeste.
              </FieldHelp>
            </span>
          }
          name="longitude"
          inputMode="decimal"
          defaultValue={settings.longitude ?? ""}
        />
      </div>


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

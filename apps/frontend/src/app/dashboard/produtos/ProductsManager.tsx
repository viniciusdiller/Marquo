"use client";

import { useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { Package, Plus } from "@phosphor-icons/react/dist/ssr";
import type { AdminProduct } from "@marquo/shared-types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { riseIn } from "@/lib/stagger";
import { brl } from "@/lib/money";
import {
  adjustStockAction,
  createProductAction,
  updateProductAction,
  type ProductActionState,
} from "./actions";

const initial: ProductActionState = {};

function StockControl({ product }: { product: AdminProduct }) {
  const [qty, setQty] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [confirmingOut, setConfirmingOut] = useState(false);

  function move(kind: "IN" | "OUT") {
    startTransition(() => {
      void adjustStockAction(product.id, kind, qty);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
        className="w-14 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => move("IN")}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-white/15 dark:text-stone-200"
      >
        + entrada
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirmingOut(true)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-white/15 dark:text-stone-200"
      >
        − saída
      </button>

      <ConfirmDialog
        open={confirmingOut}
        onOpenChange={setConfirmingOut}
        title="Registrar saída de estoque?"
        description={`Tira ${qty} unidade${qty > 1 ? "s" : ""} de "${product.name}" do estoque (estoque atual: ${product.stock}). Não tem como desfazer — se for engano, lance uma entrada depois pra corrigir.`}
        confirmLabel="Registrar saída"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => {
          setConfirmingOut(false);
          move("OUT");
        }}
      />
    </div>
  );
}

export function ProductsManager({ products, children }: { products: AdminProduct[]; children?: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(createProductAction, initial);
  const [showForm, setShowForm] = useState(false);
  const [, startTransition] = useTransition();
  const [confirmingDeactivate, setConfirmingDeactivate] = useState<AdminProduct | null>(null);

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        {children}

        <div>
          {showForm ? (
            <form
              action={formAction}
              className="grid gap-3 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-2 dark:border-white/10"
            >
              <Input label="Nome" name="name" required minLength={2} maxLength={120} />
              <Input label="SKU (opcional)" name="sku" maxLength={60} hint="Seu código interno ou o código de barras, para achar o produto depois." />
              <MaskedInput mask="money" label="Preço de venda (R$)" name="price" required hint="O que o cliente paga. É copiado para a comanda na hora da venda." />
              <MaskedInput mask="money" label="Custo (R$, opcional)" name="cost" hint="O que você paga por unidade. Entra no cálculo do lucro (CMV)." />
              <Input label="Estoque inicial" name="initialStock" type="number" min={0} max={1000000} step={1} hint="Quantas unidades você tem agora. Depois use entrada e saída." />
              {state.error ? (
                <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{state.error}</p>
              ) : null}
              <div className="mt-2 flex gap-2 sm:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
                >
                  {pending ? "Salvando..." : "Cadastrar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-full border border-zinc-300 px-5 py-2 text-sm dark:border-white/15 dark:text-stone-200"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600"
            >
              <Plus size={16} weight="bold" />
              Novo produto
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nenhum produto cadastrado"
            description="Use o botão ao lado pra cadastrar o primeiro."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-zinc-400">
                <tr className="border-b border-zinc-200 dark:border-white/10">
                  <th className="py-2">Produto</th>
                  <th className="py-2">Preço</th>
                  <th className="py-2">Estoque</th>
                  <th className="py-2">Movimentar</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {products.map((product, i) => (
                  <tr
                    key={product.id}
                    style={riseIn(i)}
                    className={clsx("animate-rise-in", !product.isActive && "opacity-50")}
                  >
                    <td className="py-2.5 font-medium text-zinc-900 dark:text-white">
                      {product.name}
                      {product.sku ? (
                        <span className="ml-2 text-xs text-zinc-400">{product.sku}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-zinc-600 dark:text-stone-300">
                      {brl(product.priceCents)}
                    </td>
                    <td
                      className={
                        product.stock <= 0
                          ? "py-2.5 font-semibold text-red-600 dark:text-red-400"
                          : "py-2.5 text-zinc-600 dark:text-stone-300"
                      }
                    >
                      {product.stock}
                    </td>
                    <td className="py-2.5">
                      <StockControl product={product} />
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          product.isActive
                            ? setConfirmingDeactivate(product)
                            : startTransition(() => {
                                void updateProductAction(product.id, { isActive: true });
                              })
                        }
                        className="text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-stone-200"
                      >
                        {product.isActive ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDeactivate !== null}
        onOpenChange={(open) => !open && setConfirmingDeactivate(null)}
        title="Desativar este produto?"
        description={
          confirmingDeactivate
            ? `"${confirmingDeactivate.name}" some das opções de venda em comanda. Dá pra reativar depois.`
            : undefined
        }
        confirmLabel="Desativar"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => {
          if (!confirmingDeactivate) return;
          const id = confirmingDeactivate.id;
          setConfirmingDeactivate(null);
          startTransition(() => {
            void updateProductAction(id, { isActive: false });
          });
        }}
      />
    </div>
  );
}

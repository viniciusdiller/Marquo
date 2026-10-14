"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Percent } from "@phosphor-icons/react/dist/ssr";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { formatCentsBRL } from "@/lib/masks";
import { riseIn } from "@/lib/stagger";
import { brl } from "@/lib/money";
import type { CommissionRule } from "@marquo/shared-types";
import {
  createCommissionRuleAction,
  deleteCommissionRuleAction,
  updateCommissionRuleAction,
  type CommissionRuleState,
} from "./actions";

interface Option {
  id: string;
  name: string;
}

const initial: CommissionRuleState = {};
const field =
  "rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white";

// Formulário único de regra: serve pra CRIAR (sem `rule`) e pra EDITAR (com `rule`, campos já preenchidos).
function RuleForm({
  action,
  rule,
  professionals,
  services,
  products,
  submitLabel,
  pendingLabel,
  onDone,
  onCancel,
}: {
  action: (prev: CommissionRuleState, formData: FormData) => Promise<CommissionRuleState>;
  rule?: CommissionRule;
  professionals: Option[];
  services: Option[];
  products: Option[];
  submitLabel: string;
  pendingLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [base, setBase] = useState<"SERVICE" | "PRODUCT" | "ALL">(rule?.base ?? "ALL");
  const [kind, setKind] = useState<"PERCENT" | "FIXED">(rule?.kind ?? "PERCENT");

  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="professionalId" defaultValue={rule?.professionalId} aria-label="Profissional" className={field}>
        {professionals.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        name="base"
        value={base}
        onChange={(e) => setBase(e.target.value as typeof base)}
        aria-label="Vale para"
        className={field}
      >
        <option value="ALL">Tudo</option>
        <option value="SERVICE">Serviço</option>
        <option value="PRODUCT">Produto</option>
      </select>
      {base !== "ALL" ? (
        <select
          name="targetId"
          // A key força remontar ao trocar Serviço/Produto: o alvo antigo não existe na outra lista.
          key={base}
          defaultValue={rule && rule.base === base ? (rule.targetId ?? "") : ""}
          aria-label={base === "SERVICE" ? "Serviço" : "Produto"}
          className={field}
        >
          <option value="">{base === "SERVICE" ? "Qualquer serviço" : "Qualquer produto"}</option>
          {(base === "SERVICE" ? services : products).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : null}
      <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo" className={field}>
        <option value="PERCENT">%</option>
        <option value="FIXED">R$ fixo</option>
      </select>
      {kind === "PERCENT" ? (
        <input
          key="percent"
          name="value"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          required
          defaultValue={rule?.kind === "PERCENT" ? rule.value : undefined}
          placeholder="% (0–100)"
          aria-label="Percentual da comissão"
          className={`w-24 ${field}`}
        />
      ) : (
        <MoneyInput
          key="fixed"
          name="value"
          required
          defaultValue={rule?.kind === "FIXED" ? formatCentsBRL(rule.value) : undefined}
          placeholder="R$ 0,00"
          aria-label="Valor fixo da comissão (R$)"
          className={`w-28 ${field}`}
        />
      )}
      {rule ? (
        <label className="flex items-center gap-1.5 pb-2 text-sm text-zinc-600 dark:text-stone-300">
          <input type="checkbox" name="isActive" defaultChecked={rule.isActive} />
          Ativa
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-white/15 dark:text-stone-200"
        >
          Cancelar
        </button>
      ) : null}
      {state.error ? <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}

export function ComissoesView({
  rules,
  professionals,
  services,
  products,
}: {
  rules: CommissionRule[];
  professionals: Option[];
  services: Option[];
  products: Option[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CommissionRule | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const proName = (id: string) => professionals.find((p) => p.id === id)?.name ?? id;
  const targetName = (rule: CommissionRule) => {
    if (!rule.targetId) return "tudo";
    return (
      services.find((s) => s.id === rule.targetId)?.name ??
      products.find((p) => p.id === rule.targetId)?.name ??
      rule.targetId
    );
  };
  // Frase em português corrido em vez de "profissional · base (alvo)" — a lista crua não
  // dizia em linguagem simples o que a regra realmente faz, nem qual delas vale quando
  // duas se aplicam ao mesmo item (a mais específica vence — ver aviso abaixo da lista).
  const ruleSentence = (rule: CommissionRule) => {
    const amount = rule.kind === "PERCENT" ? `${rule.value}%` : brl(rule.value);
    const pro = proName(rule.professionalId);
    if (rule.base === "ALL") return `${amount} sobre qualquer venda de ${pro}.`;
    const what = rule.targetId
      ? targetName(rule)
      : rule.base === "SERVICE"
        ? "qualquer serviço"
        : "qualquer produto";
    return `${amount} sobre cada venda de ${what} por ${pro}.`;
  };

  const shared = { professionals, services, products };

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startDelete(async () => {
      const result = await deleteCommissionRuleAction(id);
      if (result.error) setDeleteError(result.error);
      else setDeleting(null);
    });
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Regras de comissão</h2>

        {rules.length > 0 ? (
          <>
            <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-white/5">
              {rules.map((rule, i) => (
                <li
                  key={rule.id}
                  style={riseIn(i)}
                  className="animate-rise-in py-3 text-zinc-700 dark:text-stone-200"
                >
                  {editingId === rule.id ? (
                    <RuleForm
                      {...shared}
                      rule={rule}
                      action={updateCommissionRuleAction.bind(null, rule.id)}
                      submitLabel="Salvar"
                      pendingLabel="Salvando..."
                      onDone={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className={rule.isActive ? "" : "text-zinc-400 line-through dark:text-stone-500"}>
                        {ruleSentence(rule)}
                        {rule.isActive ? "" : <span className="ml-2 no-underline">(inativa)</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingId(rule.id)}
                          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-stone-400 dark:hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(rule);
                          }}
                          className="text-sm font-medium text-red-600/80 transition-colors hover:text-red-600 dark:text-red-400/80 dark:hover:text-red-400"
                        >
                          Excluir
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-400 dark:text-stone-500">
              Se mais de uma regra vale pra mesma venda, ganha a mais específica: um alvo
              exato (ex.: “Corte masculino”) vale mais que “qualquer serviço”, que vale mais
              que “qualquer venda”. As regras não se somam — só uma é aplicada por item. Mudar
              ou excluir uma regra vale só para as comandas que fecharem depois; o que já foi
              calculado não muda.
            </p>
          </>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={Percent}
              title="Nenhuma regra ainda"
              description="Sem regra, ninguém recebe comissão. Cadastre uma abaixo."
            />
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-stone-200">Nova regra</p>
          <RuleForm
            {...shared}
            action={createCommissionRuleAction}
            submitLabel="Adicionar"
            pendingLabel="Adicionando..."
          />
        </div>
      </section>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir esta regra de comissão?"
        description={
          deleting
            ? `${ruleSentence(deleting)} Comandas já fechadas não mudam; as próximas deixam de usar esta regra. Não tem como desfazer.`
            : undefined
        }
        confirmLabel="Excluir regra"
        cancelLabel="Voltar"
        tone="danger"
        isLoading={isDeleting}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

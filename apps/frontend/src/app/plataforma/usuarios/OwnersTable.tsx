"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { formatDateTime } from "@/lib/datetime";
import { ROLE_LABEL, type PlatformUserRow } from "@/lib/platform-api";

// Uma linha por dono; a setinha abre a equipe do negócio dele logo abaixo.
export function OwnersTable({ owners }: { owners: PlatformUserRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-white/10 dark:text-stone-400">
          <tr>
            <th className="w-12 px-2 py-3" aria-label="Abrir equipe" />
            <th className="px-4 py-3 font-medium">Dono</th>
            <th className="px-4 py-3 font-medium">Negócio</th>
            <th className="px-4 py-3 font-medium">Equipe</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3 font-medium">Criado em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
          {owners.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-stone-400">
                Nenhum dono encontrado.
              </td>
            </tr>
          ) : (
            owners.map((owner) => {
              const isOpen = open.has(owner.id);
              const panelId = `equipe-${owner.id}`;
              return (
                <Fragment key={owner.id}>
                  <tr className="hover:bg-zinc-50 dark:hover:bg-white/5">
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(owner.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        aria-label={`${isOpen ? "Fechar" : "Abrir"} equipe de ${owner.tenant.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <CaretRight size={16} weight="bold" className={clsx("transition-transform", isOpen && "rotate-90")} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-900 dark:text-white">{owner.name}</span>
                      <p className="text-xs text-zinc-400">{owner.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/plataforma/negocios/${owner.tenant.id}`} className="text-accent-600 hover:underline dark:text-accent-300">
                        {owner.tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">
                      {owner.teamTotal === 0 ? "Só o dono" : `${owner.teamTotal} ${owner.teamTotal === 1 ? "pessoa" : "pessoas"}`}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-stone-300">{owner.isActive ? "Ativo" : "Desativado"}</td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-stone-400">{formatDateTime(owner.createdAt)}</td>
                  </tr>
                  {isOpen ? (
                    <tr id={panelId} className="bg-zinc-50/70 dark:bg-white/[0.03]">
                      <td />
                      <td colSpan={5} className="px-4 py-3">
                        {owner.team.length === 0 ? (
                          <p className="text-sm text-zinc-500 dark:text-stone-400">Nenhuma outra pessoa na equipe deste negócio.</p>
                        ) : (
                          <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                            {owner.team.map((member) => (
                              <li key={member.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 py-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-zinc-900 dark:text-white">{member.name}</p>
                                  <p className="truncate text-xs text-zinc-400">{member.email}</p>
                                </div>
                                <span className="text-zinc-600 dark:text-stone-300">{ROLE_LABEL[member.role] ?? member.role}</span>
                                <span className="text-zinc-600 dark:text-stone-300">{member.isActive ? "Ativo" : "Desativado"}</span>
                                <span className="text-zinc-500 dark:text-stone-400">{formatDateTime(member.createdAt)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {owner.teamTotal > owner.team.length ? (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-stone-400">
                            Mostrando {owner.team.length} de {owner.teamTotal}.{" "}
                            <Link href={`/plataforma/negocios/${owner.tenant.id}`} className="text-accent-600 hover:underline dark:text-accent-300">
                              Ver todos no negócio
                            </Link>
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

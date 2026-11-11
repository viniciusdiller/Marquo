"use client";

import { useState, useTransition } from "react";
import {
  ACCESS_AREAS,
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABEL,
  type AccessLevel,
  type AccessPermissions,
  type AccessProfileSummary,
  type AccessUserSummary,
  normalizePermissions,
} from "@marquo/shared-types";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  type AccessActionState,
  createAccessUserAction,
  createProfileAction,
  deleteProfileAction,
  resetAccessPasswordAction,
  updateAccessUserAction,
  updateProfileAction,
} from "./actions";

const KIND_LABEL: Record<string, string> = { RECEPTIONIST: "Equipe", PROFESSIONAL: "Profissional" };
const selectCls =
  "rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white";

export function summarize(permissions: AccessPermissions): string {
  const values = Object.values(permissions);
  const edit = values.filter((v) => v === "EDIT").length;
  const view = values.filter((v) => v === "VIEW").length;
  if (edit + view === 0) return "Nenhum acesso";
  return [edit ? `edita ${edit}` : "", view ? `só vê ${view}` : ""].filter(Boolean).join(" · ");
}

function ErrorLine({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  ) : null;
}

// ---------- Editor de perfil (matriz área × nível) ----------

function ProfileEditor({
  profile,
  onDone,
}: {
  profile: AccessProfileSummary | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [permissions, setPermissions] = useState<AccessPermissions>(normalizePermissions(profile?.permissions ?? {}));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const setAll = (level: AccessLevel) =>
    setPermissions(normalizePermissions(Object.fromEntries(ACCESS_AREAS.map((a) => [a.key, level]))));

  function save() {
    setError(undefined);
    start(async () => {
      const input = { name, description, permissions };
      const result: AccessActionState = profile ? await updateProfileAction(profile.id, input) : await createProfileAction(input);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  const groups = Array.from(new Set(ACCESS_AREAS.map((a) => a.group)));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/30">
      <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
        {profile ? `Editar perfil: ${profile.name}` : "Novo perfil"}
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input id="profile-name" label="Nome do perfil" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Caixa" />
        <Input id="profile-description" label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-stone-400">
        <span>Marcar tudo como:</span>
        {ACCESS_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setAll(level)}
            className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-900/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            {ACCESS_LEVEL_LABEL[level]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {groups.map((group) => (
          <fieldset key={group} className="min-w-0">
            <legend className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-stone-500">{group}</legend>
            <ul className="mt-1 divide-y divide-zinc-100 dark:divide-white/5">
              {ACCESS_AREAS.filter((a) => a.group === group).map((area) => (
                <li key={area.key} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{area.label}</p>
                    <p className="text-xs text-zinc-500 dark:text-stone-400">{area.hint}</p>
                  </div>
                  <div role="radiogroup" aria-label={area.label} className="flex shrink-0 overflow-hidden rounded-lg border border-zinc-300 text-xs font-medium dark:border-white/15">
                    {ACCESS_LEVELS.map((level) => {
                      const selected = permissions[area.key] === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setPermissions((p) => ({ ...p, [area.key]: level }))}
                          className={clsx(
                            "px-3 py-1.5 transition-colors",
                            selected
                              ? level === "NONE"
                                ? "bg-zinc-200 text-zinc-800 dark:bg-white/15 dark:text-white"
                                : "bg-accent-500 text-white"
                              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-stone-300 dark:hover:bg-white/5",
                          )}
                        >
                          {ACCESS_LEVEL_LABEL[level]}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <ErrorLine message={error} />
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={pending || name.trim().length < 2} className="px-5 py-2 text-sm">
            {pending ? "Salvando..." : profile ? "Salvar perfil" : "Criar perfil"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending} className="px-5 py-2 text-sm">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Pessoas ----------

function NewPersonForm({ profiles, onDone }: { profiles: AccessProfileSummary[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function save() {
    setError(undefined);
    start(async () => {
      const result = await createAccessUserAction({ name, email, password, profileId });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/30">
      <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">Nova pessoa</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-stone-400">
        Para quem não atende (caixa, recepção...). Quem atende e tem agenda própria é cadastrado em Profissionais.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Input id="person-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Input id="person-email" label="E-mail (é o login)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        <Input id="person-password" label="Senha inicial" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} hint="Mínimo de 8 caracteres. Combine com a pessoa por fora do sistema." autoComplete="new-password" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-person-profile" className="text-sm font-medium text-zinc-700 dark:text-stone-200">Perfil</label>
          <select id="new-person-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} className={clsx(selectCls, "py-2.5")}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <ErrorLine message={error} />
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={pending || !name.trim() || !email.trim() || password.length < 8 || !profileId} className="px-5 py-2 text-sm">
            {pending ? "Criando..." : "Criar pessoa"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending} className="px-5 py-2 text-sm">Cancelar</Button>
        </div>
      </div>
    </div>
  );
}

function PersonRow({ person, profiles }: { person: AccessUserSummary; profiles: AccessProfileSummary[] }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const isProfessional = person.role === "PROFESSIONAL";

  function patch(p: { profileId?: string; isActive?: boolean }) {
    setError(undefined);
    start(async () => {
      const result = await updateAccessUserAction(person.id, p);
      if (result.error) setError(result.error);
    });
  }

  function resetPassword() {
    start(async () => {
      const result = await resetAccessPasswordAction(person.id, newPassword);
      if (result.error) setError(result.error);
      else {
        setResetting(false);
        setNewPassword("");
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900 dark:text-white">
            {person.name}
            {!person.isActive ? <span className="ml-2 text-xs font-normal text-zinc-400">inativo</span> : null}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-stone-400">
            {person.email} · {KIND_LABEL[person.role] ?? person.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Perfil de ${person.name}`}
            value={person.profile?.id ?? ""}
            disabled={pending}
            onChange={(e) => e.target.value && patch({ profileId: e.target.value })}
            className={selectCls}
          >
            {!person.profile ? <option value="">Sem perfil</option> : null}
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => setResetting((v) => !v)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium dark:border-white/15 dark:text-stone-200">
            Nova senha
          </button>
          {!isProfessional ? (
            <button type="button" disabled={pending} onClick={() => patch({ isActive: !person.isActive })} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium dark:border-white/15 dark:text-stone-200">
              {person.isActive ? "Desativar" : "Reativar"}
            </button>
          ) : null}
        </div>
      </div>
      {resetting ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input id={`reset-${person.id}`} label="Nova senha" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} maxLength={72} autoComplete="new-password" />
          <Button type="button" onClick={resetPassword} disabled={pending || newPassword.length < 8} className="px-5 py-2 text-sm">Salvar senha</Button>
        </div>
      ) : null}
      <ErrorLine message={error} />
    </li>
  );
}

// ---------- Tela ----------

export function AccessManager({ profiles, users }: { profiles: AccessProfileSummary[]; users: AccessUserSummary[] }) {
  const [editing, setEditing] = useState<AccessProfileSummary | "new" | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [deleting, setDeleting] = useState<AccessProfileSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteProfileAction(deleting.id);
      if (result.error) setDeleteError(result.error);
      else setDeleting(null);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="perfis-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="perfis-heading" className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Perfis</h2>
          {editing === null ? (
            <Button type="button" onClick={() => setEditing("new")} className="px-5 py-2 text-sm">Novo perfil</Button>
          ) : null}
        </div>

        {editing ? (
          <ProfileEditor key={editing === "new" ? "new" : editing.id} profile={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        ) : null}

        <ul className="divide-y divide-zinc-200 dark:divide-white/10">
          {profiles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-white">{p.name}</p>
                <p className="text-xs text-zinc-500 dark:text-stone-400">
                  {summarize(p.permissions)} · {p.usersCount} {p.usersCount === 1 ? "pessoa" : "pessoas"}
                </p>
                {p.description ? <p className="text-xs text-zinc-400">{p.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(p)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-white/15 dark:text-stone-200">Editar</button>
                <button type="button" onClick={() => { setDeleteError(null); setDeleting(p); }} className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:text-red-500">Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pessoas-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pessoas-heading" className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Pessoas</h2>
          {!addingPerson ? (
            <Button type="button" onClick={() => setAddingPerson(true)} disabled={profiles.length === 0} className="px-5 py-2 text-sm">Nova pessoa</Button>
          ) : null}
        </div>
        {addingPerson ? <NewPersonForm profiles={profiles} onDone={() => setAddingPerson(false)} /> : null}
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-stone-400">Ninguém além de você ainda. Crie um perfil e depois a pessoa.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-white/10">
            {users.map((u) => (
              <PersonRow key={u.id} person={u} profiles={profiles} />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Excluir o perfil "${deleting?.name ?? ""}"?`}
        description="Só é possível excluir um perfil que ninguém está usando."
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={confirmDelete}
        isLoading={deletePending}
        errorMessage={deleteError}
      />
    </div>
  );
}

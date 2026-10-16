"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Button } from "@/components/ui/Button";
import { FilePicker } from "@/components/ui/FilePicker";
import { compressImageFile } from "@/lib/image-compression";
import {
  updateTenantProfileAction,
  uploadLogoAction,
  removeLogoAction,
  type UpdateProfileState,
  type UploadLogoState,
} from "./actions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
// Mesma dimensão máxima usada pelo backend pro logo (LOGO_MAX_DIMENSION em
// tenants.service.ts).
const MAX_DIMENSION = 800;

interface TenantProfile {
  description: string | null;
  address: string | null;
  businessHours: string | null;
  logoUrl: string | null;
  updatedAt: string;
  accentColor: string | null;
  whatsappNumber: string | null;
  instagramUrl: string | null;
  showServices: boolean;
  showTeam: boolean;
  showGallery: boolean;
  showContact: boolean;
  minSchedulingLeadTimeMinutes: number;
  maxSchedulingLeadTimeDays: number;
}

const SECTION_TOGGLES = [
  { name: "showServices", label: "Serviços" },
  { name: "showTeam", label: "Equipe" },
  { name: "showGallery", label: "Galeria" },
  { name: "showContact", label: "Contato" },
] as const;

const profileInitialState: UpdateProfileState = {};
const uploadInitialState: UploadLogoState = {};

function RemoveLogoButton({ onRequestConfirm }: { onRequestConfirm: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        // Sem confirmação era um clique só. Sem JS o botão continua type=submit e remove
        // direto — o handler só roda se o JS carregar.
        event.preventDefault();
        onRequestConfirm();
      }}
      className="rounded-md text-sm font-medium text-red-600 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-wait disabled:opacity-60 dark:text-red-400"
    >
      {pending ? "Removendo..." : "Remover"}
    </button>
  );
}

export function TenantProfileSettingsForm({ tenant }: { tenant: TenantProfile }) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateTenantProfileAction,
    profileInitialState,
  );
  const [uploadState, uploadFormAction, uploadPending] = useActionState(
    uploadLogoAction,
    uploadInitialState,
  );
  const [removeLogoState, removeLogoFormAction] = useActionState(removeLogoAction, {});
  const [compressing, setCompressing] = useState(false);
  const [logoChosen, setLogoChosen] = useState(false);
  const removeLogoFormRef = useRef<HTMLFormElement>(null);
  const [confirmingRemoveLogo, setConfirmingRemoveLogo] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    const compressed = await compressImageFile(file, { maxDimension: MAX_DIMENSION });
    setCompressing(false);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(compressed);
    e.target.files = dataTransfer.files;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-white/10">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Logo</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-stone-400">
          Aparece na página pública do seu negócio.
        </p>

        <div className="mt-4 flex items-center gap-4">
          {tenant.logoUrl ? (
            // Nome de arquivo fixo por tenant (ver TenantsService.updateLogo) — sem o
            // parametro de versao aqui, o navegador continuaria mostrando a logo antiga em
            // cache depois de um reenvio, mesmo com o backend ja tendo trocado o arquivo.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}${tenant.logoUrl}?v=${encodeURIComponent(tenant.updatedAt)}`}
              alt="Logo do negócio"
              className="h-16 w-16 rounded-xl object-cover ring-1 ring-zinc-900/5 dark:ring-white/10"
            />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-zinc-100 dark:bg-white/5" />
          )}

          <form action={uploadFormAction} className="flex flex-wrap items-center gap-3">
            <FilePicker
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              onSelectionChange={(name) => setLogoChosen(name !== null)}
              disabled={uploadPending || compressing}
            />
            <Button
              type="submit"
              variant="ghost"
              disabled={!logoChosen || uploadPending || compressing}
              className="text-sm"
            >
              {compressing ? "Comprimindo..." : uploadPending ? "Enviando..." : "Enviar"}
            </Button>
          </form>

          {tenant.logoUrl ? (
            <form ref={removeLogoFormRef} action={removeLogoFormAction}>
              <RemoveLogoButton onRequestConfirm={() => setConfirmingRemoveLogo(true)} />
            </form>
          ) : null}
        </div>

        {uploadState?.error ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadState.error}</p>
        ) : null}
        {removeLogoState?.error ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{removeLogoState.error}</p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmingRemoveLogo}
        onOpenChange={setConfirmingRemoveLogo}
        title="Remover a logo?"
        description="A página pública do seu negócio fica sem logo até você enviar outra."
        confirmLabel="Remover"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => {
          setConfirmingRemoveLogo(false);
          removeLogoFormRef.current?.requestSubmit();
        }}
      />

      <form
        action={profileAction}
        className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-white/10"
      >
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Perfil público</p>

        <Input
          label="Descrição"
          name="description"
          maxLength={500}
          defaultValue={tenant.description ?? ""}
          placeholder="Cortes modernos e atendimento personalizado."
        />
        <Input
          label="Endereço"
          name="address"
          maxLength={300}
          autoComplete="street-address"
          defaultValue={tenant.address ?? ""}
          placeholder="Rua Exemplo, 123 - Centro"
        />
        <Input
          label="Horário de funcionamento"
          name="businessHours"
          maxLength={500}
          defaultValue={tenant.businessHours ?? ""}
          placeholder="Seg-Sex 9h-19h, Sáb 9h-13h"
        />
        <MaskedInput
          mask="phone"
          label="WhatsApp"
          name="whatsappNumber"
          type="tel"
          defaultValue={tenant.whatsappNumber ?? ""}
          placeholder="(11) 91234-5678"
          hint="DDD + número. O link do WhatsApp da sua página usa este número."
        />
        <Input
          label="Instagram"
          name="instagramUrl"
          defaultValue={tenant.instagramUrl ?? ""}
          placeholder="@seusalao"
          maxLength={300}
          autoCapitalize="none"
          spellCheck={false}
          hint="Seu @ ou o link do perfil."
        />

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-zinc-700 dark:text-stone-200">
            Seções visíveis na página
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SECTION_TOGGLES.map((section) => (
              <label
                key={section.name}
                className="flex items-center gap-2 text-sm text-zinc-600 dark:text-stone-300"
              >
                <input
                  type="checkbox"
                  name={section.name}
                  defaultChecked={tenant[section.name]}
                  className="h-4 w-4 rounded border-zinc-300 text-accent-500 focus:ring-accent-500/20 dark:border-white/15"
                />
                {section.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-400 dark:text-stone-500">
            Uma seção só aparece se também tiver conteúdo cadastrado.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Input
              type="number"
              min="0"
              label="Antecedência mínima (minutos)"
              name="minSchedulingLeadTimeMinutes"
              defaultValue={tenant.minSchedulingLeadTimeMinutes ?? 120}
              hint="Ex: 120 para não permitirem agendar com menos de 2h."
            />
          </div>
          <div className="flex-1">
            <Input
              type="number"
              min="1"
              label="Agenda aberta por (dias)"
              name="maxSchedulingLeadTimeDays"
              defaultValue={tenant.maxSchedulingLeadTimeDays ?? 60}
              hint="Ex: 60 para não marcarem muito para o futuro."
            />
          </div>
        </div>

        {profileState?.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{profileState.error}</p>
        ) : null}
        {profileState?.success ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Salvo.</p>
        ) : null}

        <div>
          <Button type="submit" disabled={profilePending} className="disabled:opacity-60">
            {profilePending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

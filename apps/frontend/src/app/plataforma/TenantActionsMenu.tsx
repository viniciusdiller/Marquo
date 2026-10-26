"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { DotsThreeVertical } from "@phosphor-icons/react/dist/ssr";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { formatPhoneBR } from "@/lib/masks";
import {
  extendTrialAction,
  grantCourtesyAction,
  passwordResetLinkAction,
  purgeTenantDataAction,
  scheduleTenantDeletionAction,
  reactivateTenantAction,
  removeCourtesyAction,
  suspendTenantAction,
  updateOwnerPhoneAction,
  type PlatformActionResult,
} from "./actions";

type Tier = "ESSENCIAL" | "PROFISSIONAL" | "PREMIUM";
type DialogKey = "suspend" | "reactivate" | "trial" | "plan" | "removeCourtesy" | "phone" | "link" | "delete";

const BTN = "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60";
const NEUTRAL = `${BTN} text-zinc-800 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-100 dark:ring-white/20 dark:hover:bg-white/10`;
const PRIMARY = `${BTN} bg-accent-500 text-white hover:bg-accent-600`;
const DANGER = `${BTN} bg-red-600 text-white hover:bg-red-700`;
const FIELD =
  "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white";

const TIERS: { value: Tier; label: string }[] = [
  { value: "ESSENCIAL", label: "Essencial (até 2 profissionais)" },
  { value: "PROFISSIONAL", label: "Profissional (até 5 profissionais)" },
  { value: "PREMIUM", label: "Premium (ilimitado)" },
];

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-zinc-950/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
      >
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">{title}</h2>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  ) : null;
}

export interface TenantActionsMenuProps {
  tenantId: string;
  tenantName: string;
  // Endereço do negócio: é o que se digita para confirmar a exclusão.
  tenantSlug: string;
  suspended: boolean;
  hasSubscription: boolean;
  courtesy: boolean;
  hasActiveOwner: boolean;
  ownerPhone: string | null;
  // "menu": botão com lista suspensa (linha da tabela). "buttons": todos à vista (detalhe).
  variant?: "menu" | "buttons";
}

// Todas as ações da plataforma sobre um negócio, num componente só: o mesmo conjunto aparece na lista
// (menu) e no detalhe (botões). A UI só esconde o que não se aplica; quem decide é o backend.
export function TenantActionsMenu({
  tenantId,
  tenantName,
  tenantSlug,
  suspended,
  hasSubscription,
  courtesy,
  hasActiveOwner,
  ownerPhone,
  variant = "menu",
}: TenantActionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Posição do menu em coordenadas da janela: a tabela rola na horizontal (overflow), o que cortaria um
  // menu absoluto nas últimas linhas.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [dialog, setDialog] = useState<DialogKey | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string; ownerEmail: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [reason, setReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [wait90, setWait90] = useState(false);
  const [days, setDays] = useState("14");
  const [tier, setTier] = useState<Tier>("PROFISSIONAL");
  const [courtesyDays, setCourtesyDays] = useState("30");
  const [noEnd, setNoEnd] = useState(false);
  const [phone, setPhone] = useState(ownerPhone ? formatPhoneBR(ownerPhone) : "");

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  function close() {
    setDialog(null);
    setError(null);
  }

  function run(action: () => Promise<PlatformActionResult>, success: string, after?: (r: PlatformActionResult) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setNotice(success);
        after?.(result);
        // O diálogo do link fica aberto para mostrar o link (aparece só uma vez); os demais fecham.
        if (!result.link) setDialog(null);
      } else {
        setError(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  function openDialog(next: DialogKey) {
    setOpen(false);
    setError(null);
    setNotice(null);
    setLink(null);
    setCopied(false);
    setConfirmSlug("");
    setUnderstood(false);
    setWait90(false);
    setReason("");
    setDialog(next);
  }

  const items: { key: DialogKey; label: string; show: boolean }[] = [
    { key: "suspend", label: "Suspender negócio", show: !suspended },
    { key: "reactivate", label: "Reativar negócio", show: suspended },
    { key: "trial", label: "Estender período de teste", show: !hasSubscription },
    {
      key: "plan",
      label: courtesy ? "Trocar plano de cortesia" : "Definir plano (cortesia)",
      show: !hasSubscription || courtesy,
    },
    { key: "removeCourtesy", label: "Remover cortesia", show: courtesy },
    {
      key: "phone",
      label: ownerPhone ? "Editar telefone do dono" : "Informar telefone do dono",
      show: hasActiveOwner,
    },
    { key: "link", label: "Link de redefinição de senha", show: hasActiveOwner },
    { key: "delete", label: "Excluir negócio", show: true },
  ];
  const visible = items.filter((item) => item.show);

  const daysNumber = Number(days);
  const courtesyNumber = Number(courtesyDays);
  const courtesyDaysValid = Number.isInteger(courtesyNumber) && courtesyNumber >= 1 && courtesyNumber <= 730;

  return (
    <div ref={menuRef} className={variant === "menu" ? "relative inline-block text-left" : "flex flex-col gap-3"}>
      {variant === "menu" ? (
        <>
          <button
            type="button"
            aria-label={`Ações de ${tenantName}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
              setOpen((v) => !v);
            }}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <DotsThreeVertical size={20} weight="bold" />
          </button>
          {open && menuPos ? (
            <ul
              role="menu"
              style={{ top: menuPos.top, right: menuPos.right }}
              className="fixed z-40 w-64 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-zinc-900"
            >
              {visible.map((item) => (
                <li key={item.key} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openDialog(item.key)}
                    className={clsx(
                      "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-900/5 dark:hover:bg-white/10",
                      item.key === "suspend" || item.key === "delete" ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-stone-100",
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => openDialog(item.key)}
              className={item.key === "suspend" || item.key === "delete" ? DANGER : item.key === "reactivate" ? PRIMARY : NEUTRAL}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {notice && variant === "buttons" ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}

      {dialog === "suspend" ? (
        <Modal title={`Suspender ${tenantName}`} onClose={close}>
          <p className="text-xs text-zinc-600 dark:text-stone-300">
            O acesso é bloqueado na hora e o negócio sai do marketplace. Nenhum dado é apagado. O motivo fica na
            auditoria.
          </p>
          <label className="text-sm font-medium text-zinc-900 dark:text-white" htmlFor={`reason-${tenantId}`}>
            Motivo
          </label>
          <textarea
            id={`reason-${tenantId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            className={FIELD}
          />
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={DANGER}
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                run(() => suspendTenantAction(tenantId, reason.trim()), "Negócio suspenso.", () => setReason(""))
              }
            >
              {pending ? "Suspendendo..." : "Suspender"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "delete" ? (
        <Modal title={`Excluir ${tenantName}`} onClose={close}>
          <p className="text-sm text-zinc-600 dark:text-stone-300">
            Por padrão apaga na hora clientes, agenda, comandas, financeiro, equipe e fotos. Ficam só o registro de pagamento, a auditoria e
            um esqueleto anônimo do negócio. Não há como desfazer. Se o negócio paga no cartão, a cobrança recorrente é cancelada no Mercado Pago antes de apagar (se o cancelamento falhar, nada é excluído).
          </p>
          <label className="text-sm font-medium text-zinc-900 dark:text-white" htmlFor={`confirm-${tenantId}`}>
            Digite o endereço do negócio para confirmar: {tenantSlug}
          </label>
          <input
            id={`confirm-${tenantId}`}
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={FIELD}
          />
          <label className="text-sm font-medium text-zinc-900 dark:text-white" htmlFor={`del-reason-${tenantId}`}>
            Motivo (opcional)
          </label>
          <textarea
            id={`del-reason-${tenantId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Vai para a auditoria, sem dados pessoais"
            className={FIELD}
          />
          <label className="flex items-start gap-2 text-sm font-medium text-zinc-900 dark:text-white">
            <input type="checkbox" checked={wait90} onChange={(e) => setWait90(e.target.checked)} className="mt-1" />
            <span>
              Aguardar 90 dias
              <span className="block text-xs font-normal text-zinc-600 dark:text-stone-300">
                Em vez de apagar agora: o negócio é suspenso hoje (perde o acesso, a cobrança no cartão é cancelada) e entra na
                fila de &quot;Exclusão de dados&quot;, onde você apaga depois dos 90 dias. Reativar o negócio cancela a espera.
              </span>
            </span>
          </label>
          {!wait90 ? (
            <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-stone-100">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1" />
              <span>Entendo que a exclusão é definitiva e não pode ser desfeita.</span>
            </label>
          ) : null}
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={DANGER}
              disabled={
                pending ||
                confirmSlug.trim() !== tenantSlug ||
                (!wait90 && !understood) ||
                (reason.trim().length > 0 && reason.trim().length < 10)
              }
              onClick={() =>
                wait90
                  ? run(
                      () => scheduleTenantDeletionAction(tenantId, confirmSlug, reason),
                      "Negócio suspenso. A exclusão fica liberada em 90 dias.",
                      () => router.refresh(),
                    )
                  : run(
                      () => purgeTenantDataAction(tenantId, confirmSlug, reason),
                      "Negócio excluído.",
                      () => {
                        router.replace("/plataforma/negocios");
                        router.refresh();
                      },
                    )
              }
            >
              {pending ? (wait90 ? "Agendando..." : "Excluindo...") : wait90 ? "Suspender e aguardar 90 dias" : "Excluir definitivamente"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "reactivate" ? (
        <Modal title={`Reativar ${tenantName}?`} onClose={close}>
          <p className="text-sm text-zinc-600 dark:text-stone-300">
            O acesso volta ao estado que o negócio tinha (teste, plano, etc.) e ele pode voltar ao marketplace.
          </p>
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={pending}
              onClick={() => run(() => reactivateTenantAction(tenantId), "Negócio reativado.")}
            >
              {pending ? "Reativando..." : "Reativar"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "trial" ? (
        <Modal title={`Estender teste de ${tenantName}`} onClose={close}>
          <label className="text-sm font-medium text-zinc-900 dark:text-white" htmlFor={`days-${tenantId}`}>
            Dias a somar (1 a 90)
          </label>
          <input
            id={`days-${tenantId}`}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))}
            className={clsx(FIELD, "w-28")}
          />
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={pending || !Number.isInteger(daysNumber) || daysNumber < 1 || daysNumber > 90}
              onClick={() => run(() => extendTrialAction(tenantId, daysNumber), `Teste estendido em ${daysNumber} dias.`)}
            >
              {pending ? "Estendendo..." : "Estender"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "plan" ? (
        <Modal title={`Plano de cortesia — ${tenantName}`} onClose={close}>
          <p className="text-xs text-zinc-600 dark:text-stone-300">
            Libera o plano sem cobrança (parceria, teste, compensação). Vale no limite de profissionais e fica na
            auditoria.
          </p>
          <label className="text-sm font-medium text-zinc-900 dark:text-white" htmlFor={`tier-${tenantId}`}>
            Plano
          </label>
          <select
            id={`tier-${tenantId}`}
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
            className={FIELD}
          >
            {TIERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-stone-100">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
            Sem data de fim
          </label>
          {!noEnd ? (
            <div>
              <label className="text-sm font-medium text-zinc-900 dark:text-white" htmlFor={`cdays-${tenantId}`}>
                Por quantos dias? (1 a 730)
              </label>
              <input
                id={`cdays-${tenantId}`}
                inputMode="numeric"
                value={courtesyDays}
                onChange={(e) => setCourtesyDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className={clsx(FIELD, "mt-1 w-28")}
              />
            </div>
          ) : null}
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={pending || (!noEnd && !courtesyDaysValid)}
              onClick={() =>
                run(
                  () => grantCourtesyAction(tenantId, tier, noEnd ? null : courtesyNumber),
                  "Plano de cortesia concedido.",
                )
              }
            >
              {pending ? "Salvando..." : "Conceder"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "removeCourtesy" ? (
        <Modal title={`Remover a cortesia de ${tenantName}?`} onClose={close}>
          <p className="text-sm text-zinc-600 dark:text-stone-300">
            O negócio volta ao estado do período de teste (em curso ou vencido, conforme a data).
          </p>
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={DANGER}
              disabled={pending}
              onClick={() => run(() => removeCourtesyAction(tenantId), "Cortesia removida.")}
            >
              {pending ? "Removendo..." : "Remover cortesia"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "phone" ? (
        <Modal title={`Telefone do dono — ${tenantName}`} onClose={close}>
          <MaskedInput
            mask="phone"
            label="Telefone (WhatsApp)"
            name={`phone-${tenantId}`}
            type="tel"
            value={phone}
            onChange={setPhone}
            hint="DDD + número. Usado para contato comercial."
          />
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className={NEUTRAL} onClick={close}>
              Cancelar
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={pending || phone.replace(/\D/g, "").length < 10}
              onClick={() => run(() => updateOwnerPhoneAction(tenantId, phone), "Telefone atualizado.")}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "link" ? (
        <Modal title="Link de redefinição de senha" onClose={close}>
          {link ? (
            <>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Link gerado para {link.ownerEmail}</p>
              <p className="text-xs text-zinc-600 dark:text-stone-300">
                Aparece só agora e vale até{" "}
                {new Date(link.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Entregue ao dono
                por outro canal, depois de confirmar a identidade. Gerar outro link invalida este.
              </p>
              <input
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link de redefinição"
                className={clsx(FIELD, "font-mono text-xs")}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={PRIMARY}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link.url);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "Copiado" : "Copiar link"}
                </button>
                <button
                  type="button"
                  className={NEUTRAL}
                  onClick={() => {
                    setLink(null);
                    close();
                  }}
                >
                  Fechar e esquecer
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600 dark:text-stone-300">
                Cria um link de uso único, válido por 24 horas, para o dono definir uma nova senha. Qualquer link
                anterior deixa de valer. A ação fica na auditoria.
              </p>
              <ErrorLine message={error} />
              <div className="flex justify-end gap-2">
                <button type="button" className={NEUTRAL} onClick={close}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => passwordResetLinkAction(tenantId),
                      "Link gerado.",
                      (result) => {
                        if (result.link && result.expiresAt && result.ownerEmail) {
                          setLink({ url: result.link, expiresAt: result.expiresAt, ownerEmail: result.ownerEmail });
                        }
                      },
                    )
                  }
                >
                  {pending ? "Gerando..." : "Gerar link"}
                </button>
              </div>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

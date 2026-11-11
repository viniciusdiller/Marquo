"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { ArrowsClockwise, CalendarBlank, Receipt, UserCircle, X } from "@phosphor-icons/react/dist/ssr";
import type { CalendarProfessional, PublicBooking } from "@marquo/shared-types";
import {
  cancelAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentStatusAction,
} from "./actions";
import { openTicketAction } from "../comandas/actions";
import { STATUS_LABEL, getStatusBadgeClasses, getStatusLabel } from "@/lib/appointment-status";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { DateTimePicker } from "@/components/ui/date-time-picker";

const TIMEZONE = "America/Sao_Paulo";

// Próximos status oferecidos como botão a partir do atual. Confirmado → Finalizado vai direto (sem passar por "Em
// atendimento"), como o backend já permite em STATUS_TRANSITIONS. Só marca o atendimento: dinheiro e comissão continuam
// vindo da comanda, então quem quer registrar o pagamento abre a comanda.
const NEXT_STATUSES: Record<string, Array<"CONFIRMED" | "IN_SERVICE" | "COMPLETED" | "NO_SHOW">> = {
  SCHEDULED: ["CONFIRMED", "NO_SHOW"],
  CONFIRMED: ["IN_SERVICE", "COMPLETED", "NO_SHOW"],
  IN_SERVICE: ["COMPLETED"],
  NO_SHOW: ["CONFIRMED"],
};

export function AppointmentPanel({
  appointment,
  professionals,
  canManage,
  onClose,
  onChanged,
}: {
  appointment: PublicBooking;
  professionals: CalendarProfessional[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduleProfessionalId, setRescheduleProfessionalId] = useState(
    appointment.professionalId,
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const reduceMotion = useReducedMotion();
  // datetime-local não tem granularidade de segundo — usar o minuto atual (não "agora"
  // exato) como piso evita rejeitar o próprio minuto em que o campo foi aberto.
  const minDateTimeLocal = DateTime.now().setZone(TIMEZONE).toFormat("yyyy-LL-dd'T'HH:mm");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Com o "tem certeza?" do cancelamento aberto, o Esc é dele (fecha só ele), não deste pop-up.
      if (e.key === "Escape" && !confirmingCancel) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, confirmingCancel]);

  const total = (appointment.priceCentsSnapshot / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setPendingLabel(label);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) onChanged();
      else setError(result.error ?? "Erro.");
      setPendingLabel(null);
    });
  }

  const nextStatuses = NEXT_STATUSES[appointment.status] ?? [];
  const canCancel = !["CANCELED", "COMPLETED"].includes(appointment.status);

  const start = DateTime.fromISO(appointment.startAt).setZone(TIMEZONE).setLocale("pt-BR");
  const end = DateTime.fromISO(appointment.endAt).setZone(TIMEZONE);
  const durationMinutes = Math.max(0, Math.round(end.diff(start, "minutes").minutes));

  // Pop-up no meio da tela (portal no body, como o ConfirmDialog): não depende de nenhum ancestral nem some atrás de
  // elementos fixos como o botão de tema.
  const popup = (
    <motion.div
      role="presentation"
      initial={reduceMotion ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      // Clique fora fecha, menos enquanto o "tem certeza?" está aberto (o clique ali é do diálogo de confirmação).
      onClick={() => !confirmingCancel && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-panel-title"
        initial={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative bg-linear-to-b from-accent-50 to-white px-6 pt-6 pb-5 dark:from-accent-500/10 dark:to-zinc-950">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-4 right-4 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-4 pr-8">
            <Avatar name={appointment.clientName} size={56} tone="brand" />
            <div className="min-w-0">
              <p
                id="appointment-panel-title"
                className="truncate font-display text-xl font-bold text-zinc-900 dark:text-white"
              >
                {appointment.clientName}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-sm text-zinc-500 dark:text-stone-400">{appointment.clientPhone}</p>
                <WhatsAppButton phone={appointment.clientPhone} name={appointment.clientName} className="size-7" />
              </div>
              <span
                className={clsx(
                  "mt-2 inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold",
                  getStatusBadgeClasses(appointment.status),
                )}
              >
                {getStatusLabel(appointment.status)}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-4 dark:bg-white/5">
              <CalendarBlank size={22} weight="duotone" className="mt-0.5 shrink-0 text-accent-500" />
              <div>
                <dt className="text-xs text-zinc-500 dark:text-stone-400">Horário</dt>
                <dd className="font-semibold text-zinc-900 capitalize dark:text-white">
                  {start.toFormat("cccc, d LLL")}
                </dd>
                <dd className="text-sm text-zinc-600 dark:text-stone-300">
                  {start.toFormat("HH:mm")} – {end.toFormat("HH:mm")}
                  {durationMinutes > 0 ? ` · ${durationMinutes} min` : ""}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-4 dark:bg-white/5">
              <UserCircle size={22} weight="duotone" className="mt-0.5 shrink-0 text-accent-500" />
              <div>
                <dt className="text-xs text-zinc-500 dark:text-stone-400">Profissional</dt>
                <dd className="font-semibold text-zinc-900 dark:text-white">{appointment.professional?.user.name}</dd>
              </div>
            </div>
          </dl>

          <section aria-label="Serviços" className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <ul className="space-y-2 text-sm">
              {(appointment.items ?? []).map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span className="text-zinc-800 dark:text-stone-200">{item.serviceName}</span>
                  <span className="text-zinc-500 dark:text-stone-400">
                    {(item.priceCentsSnapshot / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-white/10">
              <span className="text-sm text-zinc-500 dark:text-stone-400">Total</span>
              <span className="font-display text-lg font-bold text-zinc-900 dark:text-white">{total}</span>
            </div>
          </section>

          {appointment.notes ? (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <span className="font-semibold">Observações: </span>
              {appointment.notes}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>

        {canManage ? (
          <footer className="space-y-3 border-t border-zinc-200 bg-zinc-50/60 px-6 py-5 dark:border-white/10 dark:bg-white/[0.03]">
            {nextStatuses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={isPending}
                    onClick={() => run(status, () => setAppointmentStatusAction(appointment.id, status))}
                    className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-500/30 transition-colors hover:bg-accent-600 disabled:opacity-50"
                  >
                    {isPending && pendingLabel === status ? "Aplicando..." : STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            ) : null}

            {["CONFIRMED", "IN_SERVICE", "COMPLETED"].includes(appointment.status) ? (
              <button
                type="button"
                disabled={isPending}
                // Sucesso redireciona para a comanda (o redirect lança dentro da action). Se falhar, o erro aparece no
                // painel: antes ele era descartado e o clique parecia não fazer nada.
                onClick={() =>
                  run("ticket", async () => {
                    const result = await openTicketAction({ appointmentId: appointment.id });
                    return { ok: result.ok, error: result.error };
                  })
                }
                className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:text-stone-100 dark:hover:bg-white/5"
              >
                <Receipt size={18} />
                {isPending && pendingLabel === "ticket" ? "Abrindo..." : "Abrir comanda"}
              </button>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              {["SCHEDULED", "CONFIRMED"].includes(appointment.status) ? (
                <button
                  type="button"
                  aria-expanded={showReschedule}
                  onClick={() => setShowReschedule((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-900/5 dark:text-stone-300 dark:hover:bg-white/10"
                >
                  <ArrowsClockwise size={16} />
                  Remarcar
                </button>
              ) : (
                <span />
              )}
              {canCancel ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirmingCancel(true)}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  {isPending && pendingLabel === "cancel" ? "Cancelando..." : "Cancelar atendimento"}
                </button>
              ) : null}
            </div>

            {showReschedule && ["SCHEDULED", "CONFIRMED"].includes(appointment.status) ? (
              <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                {professionals.length > 1 ? (
                  <label className="block text-xs text-zinc-500 dark:text-stone-400">
                    Profissional
                    <select
                      value={rescheduleProfessionalId}
                      onChange={(e) => setRescheduleProfessionalId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                    >
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <DateTimePicker label="Remarcar para" value={rescheduleValue} min={minDateTimeLocal} onChange={setRescheduleValue} />
                  </div>
                  <button
                    type="button"
                    disabled={isPending || !rescheduleValue}
                    onClick={() =>
                      run("reschedule", () =>
                        rescheduleAppointmentAction(
                          appointment.id,
                          DateTime.fromISO(rescheduleValue, { zone: TIMEZONE }).toISO()!,
                          rescheduleProfessionalId !== appointment.professionalId ? rescheduleProfessionalId : undefined,
                        ),
                      )
                    }
                    className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
                  >
                    {isPending && pendingLabel === "reschedule" ? "Movendo..." : "Mover"}
                  </button>
                </div>
              </div>
            ) : null}
          </footer>
        ) : null}
      </motion.div>

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="Cancelar este atendimento?"
        description={`O horário de ${appointment.clientName} será liberado. Essa ação não pode ser desfeita.`}
        confirmLabel="Cancelar atendimento"
        cancelLabel="Voltar"
        tone="danger"
        isLoading={isPending && pendingLabel === "cancel"}
        onConfirm={() => {
          setConfirmingCancel(false);
          run("cancel", () => cancelAppointmentAction(appointment.id));
        }}
      />
    </motion.div>
  );

  return createPortal(popup, document.body);
}

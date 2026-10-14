"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { X } from "@phosphor-icons/react/dist/ssr";
import type { CalendarProfessional, PublicBooking } from "@marquo/shared-types";
import {
  cancelAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentStatusAction,
} from "./actions";
import { openTicketAction } from "../comandas/actions";
import { STATUS_LABEL, getStatusBadgeClasses, getStatusLabel } from "@/lib/appointment-status";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TIMEZONE = "America/Sao_Paulo";

// Próximos status oferecidos como botão a partir do atual.
const NEXT_STATUSES: Record<string, Array<"CONFIRMED" | "IN_SERVICE" | "COMPLETED" | "NO_SHOW">> = {
  SCHEDULED: ["CONFIRMED", "NO_SHOW"],
  CONFIRMED: ["IN_SERVICE", "NO_SHOW"],
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
  const reduceMotion = useReducedMotion();
  // datetime-local não tem granularidade de segundo — usar o minuto atual (não "agora"
  // exato) como piso evita rejeitar o próprio minuto em que o campo foi aberto.
  const minDateTimeLocal = DateTime.now().setZone(TIMEZONE).toFormat("yyyy-LL-dd'T'HH:mm");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

  return (
    <motion.div
      role="presentation"
      initial={reduceMotion ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-40 flex justify-end bg-zinc-900/30"
      onClick={onClose}
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-panel-title"
        initial={reduceMotion ? undefined : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-full w-full max-w-sm flex-col bg-white p-6 shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p
              id="appointment-panel-title"
              className="font-display text-lg font-bold text-zinc-900 dark:text-white"
            >
              {appointment.clientName}
            </p>
            <p className="text-sm text-zinc-500 dark:text-stone-400">{appointment.clientPhone}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-zinc-400">
            <X size={20} />
          </button>
        </div>

        <span
          className={clsx(
            "mt-3 w-fit rounded-full px-2.5 py-1 text-xs font-medium",
            getStatusBadgeClasses(appointment.status),
          )}
        >
          {getStatusLabel(appointment.status)}
        </span>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-zinc-400">Horário</dt>
            <dd className="font-medium text-zinc-900 capitalize dark:text-white">
              {DateTime.fromISO(appointment.startAt)
                .setZone(TIMEZONE)
                .setLocale("pt-BR")
                .toFormat("cccc, d LLL 'às' HH:mm")}
              {" – "}
              {DateTime.fromISO(appointment.endAt).setZone(TIMEZONE).toFormat("HH:mm")}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400">Profissional</dt>
            <dd className="font-medium text-zinc-900 dark:text-white">
              {appointment.professional?.user.name}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400">Serviços</dt>
            <dd className="font-medium text-zinc-900 dark:text-white">
              <ul>
                {(appointment.items ?? []).map((item) => (
                  <li key={item.id} className="flex justify-between gap-4">
                    <span>{item.serviceName}</span>
                    <span className="text-zinc-500">
                      {(item.priceCentsSnapshot / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-2 dark:border-white/10">
            <dt className="text-zinc-400">Total</dt>
            <dd className="font-semibold text-zinc-900 dark:text-white">{total}</dd>
          </div>
          {appointment.notes ? (
            <div>
              <dt className="text-zinc-400">Observações</dt>
              <dd className="text-zinc-700 dark:text-stone-300">{appointment.notes}</dd>
            </div>
          ) : null}
        </dl>

        {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        {canManage ? (
          <div className="mt-auto space-y-3 pt-6">
            {nextStatuses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(status, () => setAppointmentStatusAction(appointment.id, status))
                    }
                    className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
                  >
                    {isPending && pendingLabel === status ? "Aplicando..." : STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            ) : null}

            {["SCHEDULED", "CONFIRMED"].includes(appointment.status) ? (
              <div className="space-y-2">
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
                  <label className="flex-1 text-xs text-zinc-500 dark:text-stone-400">
                    Remarcar para
                    <input
                      type="datetime-local"
                      value={rescheduleValue}
                      min={minDateTimeLocal}
                      onChange={(e) => setRescheduleValue(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={isPending || !rescheduleValue}
                    onClick={() =>
                      run("reschedule", () =>
                        rescheduleAppointmentAction(
                          appointment.id,
                          DateTime.fromISO(rescheduleValue, { zone: TIMEZONE }).toISO()!,
                          rescheduleProfessionalId !== appointment.professionalId
                            ? rescheduleProfessionalId
                            : undefined,
                        ),
                      )
                    }
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-white/15 dark:text-stone-200"
                  >
                    {isPending && pendingLabel === "reschedule" ? "Movendo..." : "Mover"}
                  </button>
                </div>
              </div>
            ) : null}

            {["CONFIRMED", "IN_SERVICE", "COMPLETED"].includes(appointment.status) ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run("ticket", async () => {
                    await openTicketAction({ appointmentId: appointment.id });
                    return { ok: true };
                  })
                }
                className="w-full rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-white/15 dark:text-stone-200"
              >
                {isPending && pendingLabel === "ticket" ? "Abrindo..." : "Abrir comanda"}
              </button>
            ) : null}

            {canCancel ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingCancel(true)}
                className="w-full rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/20 dark:text-red-400"
              >
                {isPending && pendingLabel === "cancel" ? "Cancelando..." : "Cancelar atendimento"}
              </button>
            ) : null}
          </div>
        ) : null}
      </motion.aside>

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
}

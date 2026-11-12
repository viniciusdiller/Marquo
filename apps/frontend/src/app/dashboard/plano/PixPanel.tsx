"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/billing";
import { attemptStatusAction, type PixView } from "./actions";

const POLL_MS = 4000;
const BTN = "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60";
const PRIMARY = `${BTN} bg-accent-500 text-white hover:bg-accent-600`;
const NEUTRAL = `${BTN} text-zinc-800 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-100 dark:ring-white/20 dark:hover:bg-white/10`;

// QR Code + copia e cola de UM Pix, com a confirmação automática: consulta o backend a cada poucos segundos (que relê o Asaas)
// até a tentativa ser aprovada, recusada ou expirar. Serve à assinatura mensal e à diferença de uma troca de plano.
export function PixPanel({
  pix,
  title = "Pague com Pix",
  intro,
  onPaid,
  onFailed,
  onClose,
}: {
  pix: PixView;
  title?: string;
  intro?: string;
  onPaid: () => void;
  onFailed: (message: string) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const polling = useRef(false);
  // Os callbacks mudam a cada render do pai; o intervalo não pode reiniciar por isso.
  const callbacks = useRef({ onPaid, onFailed });
  useEffect(() => {
    callbacks.current = { onPaid, onFailed };
  });

  useEffect(() => {
    polling.current = true;
    const timer = setInterval(async () => {
      if (!polling.current) return;
      const result = await attemptStatusAction(pix.attemptId);
      if (!result.ok) return;
      if (result.attempt.status === "APPROVED") {
        polling.current = false;
        callbacks.current.onPaid();
      } else if (result.attempt.status === "FAILED" || result.attempt.status === "EXPIRED") {
        polling.current = false;
        callbacks.current.onFailed("Este Pix expirou ou foi recusado. Gere um novo.");
      }
    }, POLL_MS);
    return () => {
      polling.current = false;
      clearInterval(timer);
    };
  }, [pix.attemptId]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-stone-300">
        Valor: <strong>{formatBRL(pix.chargeCents)}</strong>.{" "}
        {intro ?? "Abra o app do seu banco, escolha Pix e leia o QR Code ou use o código copia e cola. A confirmação é automática."}
      </p>
      {pix.qrCodeBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
          alt="QR Code do Pix"
          className="mx-auto size-48 rounded-lg border border-zinc-200 bg-white p-2 dark:border-white/15"
        />
      ) : null}
      <label className="text-xs font-medium text-zinc-500 dark:text-stone-400" htmlFor="pix-code">
        Pix copia e cola
      </label>
      <textarea
        id="pix-code"
        readOnly
        value={pix.qrCode}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-xl border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-white/15 dark:bg-zinc-900 dark:text-white"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={PRIMARY}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(pix.qrCode);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copiado" : "Copiar código"}
        </button>
        <button type="button" className={NEUTRAL} onClick={onClose}>
          Fechar (continuo aguardando)
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-stone-400" role="status">
        Aguardando o pagamento... válido até {new Date(pix.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
      </p>
    </div>
  );
}

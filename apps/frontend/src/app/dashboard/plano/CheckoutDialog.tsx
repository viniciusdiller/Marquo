"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { type BillingMethod, type PlanInfo, formatBRL } from "@/lib/billing";
import {
  attemptStatusAction,
  quoteAction,
  startCardAction,
  startPixAction,
  type PixView,
  type QuoteView,
} from "./actions";

const POLL_MS = 4000;
const BTN = "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60";
const PRIMARY = `${BTN} bg-accent-500 text-white hover:bg-accent-600`;
const NEUTRAL = `${BTN} text-zinc-800 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-900/5 dark:text-stone-100 dark:ring-white/20 dark:hover:bg-white/10`;

function Option({
  selected,
  title,
  text,
  onSelect,
}: {
  selected: boolean;
  title: string;
  text: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        "rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-accent-500 bg-accent-50/60 dark:border-accent-400 dark:bg-accent-500/10"
          : "border-zinc-200 hover:border-accent-300 dark:border-white/15",
      )}
    >
      <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{title}</span>
      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-stone-400">{text}</span>
    </button>
  );
}

export function CheckoutDialog({
  plan,
  onClose,
  // "renew": já paga por Pix e vai gerar o próximo mês (a forma de pagamento fica fixa em Pix).
  mode = "new",
}: {
  plan: PlanInfo;
  onClose: () => void;
  mode?: "new" | "renew";
}) {
  const router = useRouter();
  const [method, setMethod] = useState<BillingMethod>(mode === "renew" ? "PIX_MONTHLY" : "CARD_RECURRING");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixView | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const polling = useRef(false);

  // Cotação sem cupom ao abrir (mostra o preço e, se o cadastro deu um desconto, já aplica).
  useEffect(() => {
    let cancelled = false;
    quoteAction(plan.tier, "").then((result) => {
      if (!cancelled && result.ok) setQuote(result.quote);
    });
    return () => {
      cancelled = true;
    };
  }, [plan.tier]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pix gerado: consulta o status até confirmar (o backend relê o Mercado Pago a cada consulta).
  useEffect(() => {
    if (!pix || paid) return;
    polling.current = true;
    const timer = setInterval(async () => {
      if (!polling.current) return;
      const result = await attemptStatusAction(pix.attemptId);
      if (!result.ok) return;
      if (result.attempt.status === "APPROVED") {
        polling.current = false;
        setPaid(true);
        router.refresh();
      } else if (result.attempt.status === "FAILED" || result.attempt.status === "EXPIRED") {
        polling.current = false;
        setPix(null);
        setError("Este Pix expirou ou foi recusado. Gere um novo.");
      }
    }, POLL_MS);
    return () => {
      polling.current = false;
      clearInterval(timer);
    };
  }, [pix, paid, router]);

  function applyCoupon() {
    setError(null);
    startTransition(async () => {
      const result = await quoteAction(plan.tier, coupon);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuote(result.quote);
      if (result.quote.couponError) setError(result.quote.couponError);
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      if (method === "CARD_RECURRING") {
        const result = await startCardAction(plan.tier, coupon);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // O pagamento acontece na página segura do Mercado Pago, que devolve o dono para /dashboard/plano.
        window.location.assign(result.url);
        return;
      }
      const result = await startPixAction(plan.tier, coupon);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPix(result.pix);
    });
  }

  const charge = quote?.chargeCents ?? plan.priceCents;
  const hasDiscount = (quote?.discountCents ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 cursor-default bg-zinc-950/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Assinar o plano ${plan.name}`}
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
      >
        {paid ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Pagamento confirmado!</h2>
            <p className="text-sm text-zinc-600 dark:text-stone-300">
              Seu plano {plan.name} está ativo. Obrigado por usar o Marquo.
            </p>
            <button type="button" className={PRIMARY} onClick={onClose}>
              Fechar
            </button>
          </div>
        ) : pix ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Pague com Pix</h2>
            <p className="text-sm text-zinc-600 dark:text-stone-300">
              Valor: <strong>{formatBRL(pix.chargeCents)}</strong>. Abra o app do seu banco, escolha Pix e leia o QR
              Code ou use o código copia e cola. A confirmação é automática.
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
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
              {mode === "renew" ? "Pagar o próximo mês" : `Assinar o plano ${plan.name}`}
            </h2>

            {mode === "new" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Option
                  selected={method === "CARD_RECURRING"}
                  title="Cartão (recorrente)"
                  text="Cobra automaticamente todo mês. Cancele quando quiser."
                  onSelect={() => setMethod("CARD_RECURRING")}
                />
                <Option
                  selected={method === "PIX_MONTHLY"}
                  title="Pix mensal"
                  text="Você paga um Pix a cada mês. Sem pagar, o acesso termina no fim do mês."
                  onSelect={() => setMethod("PIX_MONTHLY")}
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-stone-300">
                Gere o Pix do próximo mês. O período novo começa quando o atual termina, sem perder dias.
              </p>
            )}

            <div>
              <label htmlFor="coupon" className="text-sm font-medium text-zinc-900 dark:text-white">
                Cupom de desconto (opcional)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="coupon"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  maxLength={32}
                  autoComplete="off"
                  placeholder="CÓDIGO"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-white/15 dark:bg-zinc-900 dark:text-white"
                />
                <button type="button" className={NEUTRAL} disabled={pending || !coupon.trim()} onClick={applyCoupon}>
                  Aplicar
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-white/5">
              <div className="flex justify-between text-zinc-600 dark:text-stone-300">
                <span>Plano {plan.name}</span>
                <span>{formatBRL(plan.priceCents)}/mês</span>
              </div>
              {hasDiscount ? (
                <div className="mt-1 flex justify-between text-emerald-700 dark:text-emerald-300">
                  <span>Cupom {quote?.coupon?.code}</span>
                  <span>− {formatBRL(quote?.discountCents ?? 0)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-semibold text-zinc-900 dark:border-white/10 dark:text-white">
                <span>{hasDiscount ? "Primeira cobrança" : "Total hoje"}</span>
                <span>{formatBRL(charge)}</span>
              </div>
              {hasDiscount ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-stone-400">
                  O desconto vale só na primeira cobrança; depois, {formatBRL(plan.priceCents)} por mês.
                </p>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" className={NEUTRAL} onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className={PRIMARY} disabled={pending} onClick={confirm}>
                {pending
                  ? "Aguarde..."
                  : method === "CARD_RECURRING"
                    ? "Ir para o pagamento"
                    : "Gerar Pix"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

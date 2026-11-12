"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { type BillingMethod, type PlanInfo, formatBRL } from "@/lib/billing";
import { formatCep, formatPhoneBR, hasCpfOrCnpjLength } from "@/lib/masks";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Input } from "@/components/ui/Input";
import { PixPanel } from "./PixPanel";
import {
  billingProfileAction,
  quoteAction,
  startCardAction,
  startPixAction,
  type BillingProfileView,
  type PayerForm,
  type PixView,
  type QuoteView,
} from "./actions";

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

const PLAN_PAGE = "/dashboard/plano";

// Página de checkout (/dashboard/plano/assinar/[tier]): dados de quem paga, forma de pagamento, cupom e resumo do pedido.
// Cartão leva ao checkout seguro do Asaas; Pix mostra o QR aqui mesmo. Preço, desconto e total são sempre do backend.
export function CheckoutForm({
  plan,
  // "renew": já paga por Pix e vai gerar o próximo mês (a forma de pagamento fica fixa em Pix).
  mode = "new",
}: {
  plan: PlanInfo;
  mode?: "new" | "renew";
}) {
  const router = useRouter();
  const onClose = () => router.push(PLAN_PAGE);
  const [method, setMethod] = useState<BillingMethod>(mode === "renew" ? "PIX_MONTHLY" : "CARD_RECURRING");
  const [coupon, setCoupon] = useState("");
  // Dados do pagador (o Asaas exige CPF/CNPJ e, no cartão, telefone e endereço). O que já está no cadastro de cobrança do
  // negócio vem preenchido; o CPF/CNPJ salvo aparece só mascarado e é reaproveitado pelo servidor sem ser digitado de novo.
  const [document, setDocument] = useState("");
  const [profile, setProfile] = useState<BillingProfileView | null>(null);
  const [changingDocument, setChangingDocument] = useState(false);
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [province, setProvince] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixView | null>(null);
  const [paid, setPaid] = useState(false);
  const [pending, startTransition] = useTransition();

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

  // Cadastro de cobrança salvo: pré-preenche telefone e endereço (e diz se o CPF/CNPJ já está guardado).
  useEffect(() => {
    let cancelled = false;
    billingProfileAction().then((result) => {
      if (cancelled || !result.ok) return;
      const saved = result.profile;
      setProfile(saved);
      setPhone(formatPhoneBR(saved.phone ?? ""));
      setPostalCode(formatCep(saved.postalCode ?? ""));
      setAddress(saved.address ?? "");
      setAddressNumber(saved.addressNumber ?? "");
      setComplement(saved.complement ?? "");
      setProvince(saved.province ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const hasSavedDocument = Boolean(profile?.documentHint) && !changingDocument;
    if (!hasSavedDocument && !hasCpfOrCnpjLength(document)) {
      setError("Informe o CPF ou CNPJ de quem vai pagar.");
      return;
    }
    const card = method === "CARD_RECURRING";
    if (card && [phone, postalCode, address, addressNumber, province].some((value) => !value.trim())) {
      setError("Preencha telefone, CEP, rua, número e bairro: o Asaas exige esses dados para o cartão.");
      return;
    }
    const payer: Partial<PayerForm> = {
      cpfCnpj: hasSavedDocument ? "" : document,
      ...(card ? { phone, postalCode, address, addressNumber, complement, province } : {}),
    };
    startTransition(async () => {
      if (card) {
        const result = await startCardAction(plan.tier, coupon, payer);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // O pagamento acontece na página segura do Asaas, que devolve o dono para /dashboard/plano.
        window.location.assign(result.url);
        return;
      }
      const result = await startPixAction(plan.tier, coupon, payer);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPix(result.pix);
    });
  }

  const charge = quote?.chargeCents ?? plan.priceCents;
  const hasDiscount = (quote?.discountCents ?? 0) > 0;

  const summary = (
    <div className="rounded-xl bg-zinc-50 p-4 text-sm dark:bg-white/5">
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
      <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold text-zinc-900 dark:border-white/10 dark:text-white">
        <span>{hasDiscount ? "Primeira cobrança" : "Total hoje"}</span>
        <span>{formatBRL(charge)}</span>
      </div>
      {hasDiscount ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-stone-400">
          O desconto vale só na primeira cobrança; depois, {formatBRL(plan.priceCents)} por mês.
        </p>
      ) : null}
    </div>
  );

  if (paid) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Pagamento confirmado!</h2>
        <p className="text-sm text-zinc-600 dark:text-stone-300">Seu plano {plan.name} está ativo. Obrigado por usar o Marquo.</p>
        <button type="button" className={PRIMARY} onClick={onClose}>
          Voltar para o plano
        </button>
      </section>
    );
  }

  if (pix) {
    return (
      <section className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <PixPanel
          pix={pix}
          onClose={onClose}
          onPaid={() => {
            setPaid(true);
            router.refresh();
          }}
          onFailed={(message) => {
            setPix(null);
            setError(message);
          }}
        />
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section aria-label="Dados do pagamento" className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
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

        {profile?.documentHint && !changingDocument ? (
          <div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-white/5">
            <span className="text-zinc-600 dark:text-stone-300">CPF/CNPJ de quem paga: </span>
            <span className="font-mono font-semibold text-zinc-900 dark:text-white">{profile.documentHint}</span>
            <button
              type="button"
              className="ml-2 text-xs font-semibold text-accent-600 underline dark:text-accent-300"
              onClick={() => setChangingDocument(true)}
            >
              Trocar
            </button>
          </div>
        ) : (
          <MaskedInput
            mask="cpfCnpj"
            name="cpfCnpj"
            label="CPF ou CNPJ de quem paga"
            hint={
              profile?.canStoreDocument === false
                ? "Exigido para emitir a cobrança. Vai ao Asaas, o provedor de pagamento, e não fica salvo."
                : "Exigido para emitir a cobrança. Fica salvo criptografado no Marquo, para você não digitar de novo."
            }
            value={document}
            onChange={setDocument}
            placeholder="000.000.000-00"
          />
        )}

        {method === "CARD_RECURRING" ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-zinc-900 dark:text-white">Endereço e telefone de quem paga</legend>
            <MaskedInput mask="phone" name="phone" label="Telefone com DDD" value={phone} onChange={setPhone} placeholder="(11) 91234-5678" />
            <div className="grid grid-cols-2 gap-3">
              <MaskedInput mask="cep" name="postalCode" label="CEP" value={postalCode} onChange={setPostalCode} placeholder="00000-000" />
              <Input name="addressNumber" label="Número" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} maxLength={20} autoComplete="off" />
            </div>
            <Input name="address" label="Rua" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} autoComplete="off" />
            <div className="grid grid-cols-2 gap-3">
              <Input name="province" label="Bairro" value={province} onChange={(e) => setProvince(e.target.value)} maxLength={80} autoComplete="off" />
              <Input name="complement" label="Complemento (opcional)" value={complement} onChange={(e) => setComplement(e.target.value)} maxLength={80} autoComplete="off" />
            </div>
          </fieldset>
        ) : null}
      </section>

      <aside aria-label="Resumo do pedido" className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 lg:sticky lg:top-6 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
          {mode === "renew" ? "Pagar o próximo mês" : `Plano ${plan.name}`}
        </h2>



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

        {summary}

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button type="button" className={PRIMARY} disabled={pending} onClick={confirm}>
          {pending ? "Aguarde..." : method === "CARD_RECURRING" ? "Ir para o pagamento" : "Gerar Pix"}
        </button>
        <button type="button" className={NEUTRAL} onClick={onClose}>
          Voltar aos planos
        </button>
      </aside>
    </div>
  );
}

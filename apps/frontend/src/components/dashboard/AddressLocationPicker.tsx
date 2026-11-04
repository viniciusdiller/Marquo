"use client";

import { useState, useTransition } from "react";
import {
  MapPin,
  NavigationArrow,
  MagnifyingGlass,
  Info,
  ArrowSquareOut,
  CheckCircle,
  Question,
} from "@phosphor-icons/react/dist/ssr";
import { Input } from "@/components/ui/Input";
import { lookupCepAction, reverseGeocodeAction } from "@/app/dashboard/marketplace/actions";

interface AddressLocationPickerProps {
  initialAddress?: string | null;
  initialCity?: string | null;
  initialNeighborhood?: string | null;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}

export function AddressLocationPicker({
  initialAddress = "",
  initialCity = "",
  initialNeighborhood = "",
  initialLatitude = null,
  initialLongitude = null,
}: AddressLocationPickerProps) {
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState(initialAddress ?? "");
  const [city, setCity] = useState(initialCity ?? "");
  const [neighborhood, setNeighborhood] = useState(initialNeighborhood ?? "");
  const [latitude, setLatitude] = useState(initialLatitude ? String(initialLatitude) : "");
  const [longitude, setLongitude] = useState(initialLongitude ? String(initialLongitude) : "");

  const [isPending, startTransition] = useTransition();
  const [loadingGps, setLoadingGps] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  function formatCep(value: string) {
    const raw = value.replace(/\D/g, "").slice(0, 8);
    if (raw.length <= 5) return raw;
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  }

  function handleCepSearch(cepToSearch?: string) {
    const targetCep = cepToSearch || cep;
    const cleanCep = targetCep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      setFeedback({ type: "error", message: "Digite um CEP válido com 8 dígitos." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await lookupCepAction(cleanCep);
        if (!result.ok) {
          setFeedback({ type: "error", message: result.error || "CEP não encontrado." });
          return;
        }

        if (result.street) setStreet(result.street);
        if (result.neighborhood) setNeighborhood(result.neighborhood);
        if (result.city) setCity(result.city);

        if (result.latitude !== null && result.latitude !== undefined && result.longitude !== null && result.longitude !== undefined) {
          setLatitude(String(result.latitude));
          setLongitude(String(result.longitude));
          setFeedback({
            type: "success",
            message: "Endereço e coordenadas no mapa encontrados pelo CEP!",
          });
        } else {
          setFeedback({
            type: "success",
            message: "Endereço localizado pelo CEP. Preencha o número da rua e ajuste as coordenadas se desejar.",
          });
        }
      } catch {
        setFeedback({ type: "error", message: "Não foi possível buscar o CEP agora. Preencha manualmente." });
      }
    });
  }

  function handleUseGps() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setFeedback({ type: "error", message: "Seu navegador não suporta geolocalização por GPS." });
      return;
    }

    setLoadingGps(true);
    setFeedback({ type: "info", message: "Obtendo sua posição via GPS do navegador..." });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setLatitude(String(Number(lat.toFixed(6))));
        setLongitude(String(Number(lng.toFixed(6))));

        setFeedback({ type: "info", message: "GPS obtido! Identificando rua, bairro e cidade..." });

        try {
          const revResult = await reverseGeocodeAction(lat, lng);
          if (revResult.ok) {
            if (revResult.street) setStreet(revResult.street);
            if (revResult.neighborhood) setNeighborhood(revResult.neighborhood);
            if (revResult.city) setCity(revResult.city);
            if (revResult.cep) setCep(formatCep(revResult.cep));

            setFeedback({
              type: "success",
              message: "Localização e endereço completos identificados pelo seu GPS!",
            });
          } else {
            setFeedback({
              type: "success",
              message: "Coordenadas do GPS capturadas! Preencha o nome da rua e bairro caso estejam em branco.",
            });
          }
        } catch {
          setFeedback({
            type: "success",
            message: "Coordenadas do GPS capturadas com sucesso!",
          });
        } finally {
          setLoadingGps(false);
        }
      },
      (err) => {
        setLoadingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setFeedback({
            type: "error",
            message: "Permissão de localização negada no navegador. Autorize ou use o tutorial do Google Maps.",
          });
        } else {
          setFeedback({
            type: "error",
            message: "Não foi possível obter o sinal de GPS. Insira o CEP ou o endereço manualmente.",
          });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const hasCoords = Boolean(latitude && longitude && !isNaN(Number(latitude)) && !isNaN(Number(longitude)));

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-accent-500" weight="duotone" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Endereço & Localização no Mapa
          </h3>
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              aria-label="Ajuda sobre Localização no Mapa"
              aria-expanded={showHelp}
              className="inline-flex size-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-stone-500 dark:hover:bg-zinc-800 dark:hover:text-stone-200"
            >
              <Question size={13} weight="bold" />
            </button>
            {showHelp && (
              <div
                role="tooltip"
                className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-xl dark:border-white/10 dark:bg-zinc-900 dark:text-stone-200 sm:w-72"
              >
                A latitude e longitude alimentam a ordenação por distância no marketplace (/descobrir)
                e permitem que clientes tracem rotas até o seu salão.
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowTutorial((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
        >
          <Info size={14} />
          {showTutorial ? "Ocultar tutorial do Google Maps" : "Como pegar no Google Maps?"}
        </button>
      </div>

      {showTutorial && (
        <div className="rounded-xl border border-accent-200 bg-accent-50/70 p-4 text-xs text-accent-950 dark:border-accent-500/20 dark:bg-accent-500/10 dark:text-accent-200">
          <p className="font-semibold">Tutorial rápido: Como copiar as coordenadas no Google Maps</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
            <li>
              Acesse o{" "}
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noreferrer"
                className="underline font-medium hover:text-accent-600"
              >
                Google Maps
              </a>{" "}
              no computador ou no celular.
            </li>
            <li>Encontre o endereço exato ou a fachada da sua barbearia.</li>
            <li>
              Clique com o <strong>botão direito</strong> em cima do local (no celular, pressione e segure o dedo sobre o mapa).
            </li>
            <li>
              O primeiro item do menu que surgir são os números de latitude e longitude (ex: <code>-23.55052, -46.633308</code>).
            </li>
            <li>Clique nesses números para copiar e cole nos campos abaixo!</li>
          </ol>
        </div>
      )}

      {/* Busca rápida por CEP e GPS */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Input
            label="Buscar por CEP"
            name="cep_helper"
            placeholder="00000-000"
            maxLength={9}
            value={cep}
            onChange={(e) => {
              const formatted = formatCep(e.target.value);
              setCep(formatted);
              if (formatted.replace(/\D/g, "").length === 8) {
                handleCepSearch(formatted);
              }
            }}
            hint="Preenche endereço e coordenadas automaticamente."
          />
        </div>

        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="button"
            disabled={isPending || cep.replace(/\D/g, "").length !== 8}
            onClick={() => handleCepSearch()}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900 dark:text-stone-200"
          >
            <MagnifyingGlass size={14} />
            {isPending ? "Buscando..." : "Buscar CEP"}
          </button>

          <button
            type="button"
            disabled={loadingGps}
            onClick={handleUseGps}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent-50 px-3.5 text-xs font-semibold text-accent-700 transition hover:bg-accent-100 disabled:opacity-50 dark:bg-accent-500/10 dark:text-accent-300 dark:hover:bg-accent-500/20"
          >
            <NavigationArrow size={14} weight="bold" />
            {loadingGps ? "Identificando endereço..." : "Usar meu GPS atual"}
          </button>
        </div>
      </div>

      {/* Endereço completo (Rua, Número, Complemento) */}
      <div>
        <Input
          label="Endereço da Barbearia (Rua e número)"
          name="address"
          maxLength={300}
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="Ex: Rua Augusta, 1500"
          hint="Exibido na página pública e no comprovante do agendamento."
        />
      </div>

      {/* Cidade e Bairro */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Cidade"
          name="city"
          maxLength={120}
          autoComplete="address-level2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          hint="É o que o cliente filtra na busca do marketplace."
        />
        <Input
          label="Bairro"
          name="neighborhood"
          maxLength={120}
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          hint="Ajuda quem está por perto a encontrar sua barbearia."
        />
      </div>

      {/* Coordenadas Geográficas */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Input
            label="Latitude"
            name="latitude"
            inputMode="decimal"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="-23.550520"
            hint="Ex: -23.550520 (preenchido via CEP, GPS ou Google Maps)"
          />
        </div>
        <div>
          <Input
            label="Longitude"
            name="longitude"
            inputMode="decimal"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="-46.633308"
            hint="Ex: -46.633308 (preenchido via CEP, GPS ou Google Maps)"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {hasCoords && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle size={14} weight="fill" />
            Conferir localização no Google Maps
            <ArrowSquareOut size={12} />
          </a>
        )}
      </div>

      {feedback && (
        <p
          className={`text-xs ${
            feedback.type === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : feedback.type === "error"
                ? "text-red-600 dark:text-red-400"
                : "text-zinc-600 dark:text-stone-400"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}

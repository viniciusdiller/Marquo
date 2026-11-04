"use client";

import { useState } from "react";
import {
  MapPin,
  NavigationArrow,
  MagnifyingGlass,
  Info,
  ArrowSquareOut,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Input } from "@/components/ui/Input";
import { FieldHelp } from "@/components/ui/FieldHelp";

interface AddressLocationPickerProps {
  initialCity?: string | null;
  initialNeighborhood?: string | null;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}

export function AddressLocationPicker({
  initialCity = "",
  initialNeighborhood = "",
  initialLatitude = null,
  initialLongitude = null,
}: AddressLocationPickerProps) {
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState(initialCity ?? "");
  const [neighborhood, setNeighborhood] = useState(initialNeighborhood ?? "");
  const [latitude, setLatitude] = useState(initialLatitude ? String(initialLatitude) : "");
  const [longitude, setLongitude] = useState(initialLongitude ? String(initialLongitude) : "");

  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  async function handleCepSearch(cepValue: string) {
    const cleanCep = cepValue.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    setFeedback(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setFeedback({ type: "error", message: "CEP não encontrado. Digite o endereço manualmente." });
        return;
      }

      setCity(data.localidade ?? "");
      setNeighborhood(data.bairro ?? "");
      setStreet(data.logradouro ?? "");
      setFeedback({ type: "success", message: "Endereço localizado pelo CEP. Buscando coordenadas..." });

      // Dispara geocodificação do endereço encontrado
      const query = `${data.logradouro ?? ""}, ${data.bairro ?? ""}, ${data.localidade ?? ""}, Brasil`;
      await geocodeAddress(query);
    } catch {
      setFeedback({ type: "error", message: "Erro ao consultar o CEP. Você pode preencher manualmente." });
    } finally {
      setLoadingCep(false);
    }
  }

  async function geocodeAddress(queryAddress?: string) {
    const query = queryAddress || `${street} ${neighborhood} ${city} Brasil`.trim();
    if (!query) {
      setFeedback({ type: "error", message: "Preencha a cidade ou endereço para buscar as coordenadas." });
      return;
    }

    setLoadingGeo(true);
    setFeedback(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const results = await res.json();

      if (Array.isArray(results) && results.length > 0) {
        const item = results[0];
        setLatitude(String(Number(item.lat).toFixed(6)));
        setLongitude(String(Number(item.lon).toFixed(6)));
        setFeedback({
          type: "success",
          message: "Ponto no mapa localizado automaticamente pelo endereço!",
        });
      } else {
        setFeedback({
          type: "info",
          message: "Não encontramos as coordenadas exatas por esse endereço. Use o GPS ou o tutorial do Google Maps.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Não foi possível buscar as coordenadas agora. Insira manualmente ou use seu GPS.",
      });
    } finally {
      setLoadingGeo(false);
    }
  }

  function handleUseGps() {
    if (!navigator.geolocation) {
      setFeedback({ type: "error", message: "Seu navegador não suporta captura de GPS." });
      return;
    }

    setLoadingGps(true);
    setFeedback({ type: "info", message: "Aguardando permissão de localização do seu navegador..." });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude.toFixed(6)));
        setLongitude(String(pos.coords.longitude.toFixed(6)));
        setFeedback({
          type: "success",
          message: "Coordenadas capturadas com sucesso da sua localização atual!",
        });
        setLoadingGps(false);
      },
      (err) => {
        setLoadingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setFeedback({
            type: "error",
            message: "Permissão de localização negada. Autorize no navegador ou copie do Google Maps.",
          });
        } else {
          setFeedback({ type: "error", message: "Não foi possível obter a localização via GPS." });
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
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
          <FieldHelp title="Localização no Mapa">
            A latitude e longitude alimentam a ordenação por distância no marketplace (/descobrir)
            e permitem que clientes tracem rotas até o seu salão.
          </FieldHelp>
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

      {/* Busca rápida por CEP */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Input
            label="Buscar por CEP"
            name="cep_helper"
            placeholder="00000-000"
            maxLength={9}
            value={cep}
            onChange={(e) => {
              const val = e.target.value;
              setCep(val);
              if (val.replace(/\D/g, "").length === 8) {
                handleCepSearch(val);
              }
            }}
            hint="Preenche cidade e bairro automaticamente."
          />
        </div>

        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="button"
            disabled={loadingCep || cep.replace(/\D/g, "").length !== 8}
            onClick={() => handleCepSearch(cep)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900 dark:text-stone-200"
          >
            <MagnifyingGlass size={14} />
            {loadingCep ? "Buscando..." : "Buscar CEP"}
          </button>

          <button
            type="button"
            disabled={loadingGps}
            onClick={handleUseGps}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent-50 px-3.5 text-xs font-semibold text-accent-700 transition hover:bg-accent-100 disabled:opacity-50 dark:bg-accent-500/10 dark:text-accent-300 dark:hover:bg-accent-500/20"
          >
            <NavigationArrow size={14} weight="bold" />
            {loadingGps ? "Capturando..." : "Usar meu GPS atual"}
          </button>
        </div>
      </div>

      {/* Campos de Cidade e Bairro (usados no backend) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Cidade"
          name="city"
          required
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
          hint="Ajuda quem está perto a encontrar seu salão."
        />
      </div>

      {/* Coordenadas */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Input
            label="Latitude"
            name="latitude"
            inputMode="decimal"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="-23.550520"
            hint="Ex: -23.550520"
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
            hint="Ex: -46.633308"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          disabled={loadingGeo || !city}
          onClick={() => geocodeAddress()}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900 dark:text-stone-200"
        >
          <MagnifyingGlass size={13} />
          {loadingGeo ? "Calculando coordenadas..." : "Recalcular coordenadas pelo endereço"}
        </button>

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


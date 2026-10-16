// Posição do visitante para "perto de mim". Só roda no navegador, e só depois de um clique do
// usuário (nunca no carregamento da página): o aviso de permissão sem contexto é o que faz
// as pessoas negarem.
//
// A coordenada é arredondada para 2 casas (~1 km) ANTES de sair do navegador: a busca é um GET
// público e a URL com a coordenada fica em log de proxy/CDN. 1 km basta para ordenar salões.
export interface Coords {
  lat: number;
  lng: number;
}

const COARSE_DECIMALS = 2;

export function roundCoords(lat: number, lng: number): Coords {
  const f = 10 ** COARSE_DECIMALS;
  return { lat: Math.round(lat * f) / f, lng: Math.round(lng * f) / f };
}

// Mensagens em pt-BR para cada falha do navegador (GeolocationPositionError.code).
export function geolocationErrorMessage(code: number | null): string {
  if (code === 1) {
    return "Não foi possível usar sua localização: a permissão foi negada. Libere nas configurações do navegador ou escolha uma cidade.";
  }
  if (code === 2) return "Não conseguimos descobrir sua localização agora. Tente de novo ou escolha uma cidade.";
  if (code === 3) return "Demorou demais para obter sua localização. Tente de novo ou escolha uma cidade.";
  return "Seu navegador não permite usar a localização. Escolha uma cidade.";
}

export class GeolocationFailure extends Error {
  readonly code: number | null;

  constructor(code: number | null) {
    super(geolocationErrorMessage(code));
    this.code = code;
  }
}

export function getCoarsePosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeolocationFailure(null));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(roundCoords(pos.coords.latitude, pos.coords.longitude)),
      (err) => reject(new GeolocationFailure(err.code)),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

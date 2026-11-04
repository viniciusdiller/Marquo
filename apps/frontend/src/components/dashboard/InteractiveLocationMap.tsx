"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface InteractiveLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onPositionChange: (lat: number, lng: number) => void;
  className?: string;
}

export function InteractiveLocationMap({
  latitude,
  longitude,
  onPositionChange,
  className,
}: InteractiveLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const hasCoords = typeof latitude === "number" && !isNaN(latitude) && typeof longitude === "number" && !isNaN(longitude);

  // Inicializa o mapa Leaflet somente no client
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");

      if (!isMounted || !containerRef.current) return;

      const defaultLat = hasCoords ? latitude : -14.235; // Centro do Brasil
      const defaultLng = hasCoords ? longitude : -51.9253;
      const defaultZoom = hasCoords ? 16 : 4;

      const map = L.map(containerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: defaultZoom,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Pin SVG customizado (sem bugs de asset 404 do leaflet padrão)
      const pinIcon = L.divIcon({
        className: "marquo-map-pin",
        html: `
          <div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; cursor: grab;">
            <div style="background-color: #7c3aed; border: 2.5px solid #ffffff; border-radius: 9999px; padding: 6px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.35);">
              <svg width="20" height="20" viewBox="0 0 256 256" fill="#ffffff">
                <path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,116a28,28,0,1,1,28-28A28,28,0,0,1,128,132Z"/>
              </svg>
            </div>
            <div style="width: 2px; height: 6px; background-color: #7c3aed;"></div>
            <div style="width: 10px; height: 4px; background-color: rgba(0,0,0,0.3); border-radius: 50%;"></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      if (hasCoords) {
        const marker = L.marker([latitude, longitude], {
          draggable: true,
          icon: pinIcon,
        }).addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onPositionChangeRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
        });

        markerRef.current = marker;
      }

      // Permite clicar em qualquer lugar do mapa para mover o pin
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        const fixedLat = Number(lat.toFixed(6));
        const fixedLng = Number(lng.toFixed(6));

        if (markerRef.current) {
          markerRef.current.setLatLng([fixedLat, fixedLng]);
        } else {
          const marker = L.marker([fixedLat, fixedLng], {
            draggable: true,
            icon: pinIcon,
          }).addTo(map);

          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            onPositionChangeRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
          });

          markerRef.current = marker;
        }

        onPositionChangeRef.current(fixedLat, fixedLng);
      });

      mapRef.current = map;
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Atualiza posição do pin e visão do mapa quando as coordenadas mudam externamente
  useEffect(() => {
    if (!mapRef.current || !hasCoords) return;

    const map = mapRef.current;
    const currentCenter = map.getCenter();
    const dist = Math.hypot(currentCenter.lat - latitude, currentCenter.lng - longitude);

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    } else {
      import("leaflet").then((L) => {
        if (!mapRef.current || markerRef.current) return;
        const pinIcon = L.divIcon({
          className: "marquo-map-pin",
          html: `
            <div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; cursor: grab;">
              <div style="background-color: #7c3aed; border: 2.5px solid #ffffff; border-radius: 9999px; padding: 6px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.35);">
                <svg width="20" height="20" viewBox="0 0 256 256" fill="#ffffff">
                  <path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,116a28,28,0,1,1,28-28A28,28,0,0,1,128,132Z"/>
                </svg>
              </div>
              <div style="width: 2px; height: 6px; background-color: #7c3aed;"></div>
              <div style="width: 10px; height: 4px; background-color: rgba(0,0,0,0.3); border-radius: 50%;"></div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const marker = L.marker([latitude, longitude], { draggable: true, icon: pinIcon }).addTo(map);
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onPositionChangeRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
        });
        markerRef.current = marker;
      });
    }

    // Se a distância for relevante, anima a câmera até o ponto
    if (dist > 0.0001) {
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 16), { duration: 1 });
    }
  }, [latitude, longitude, hasCoords]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="relative h-64 w-full overflow-hidden rounded-xl border border-zinc-200 shadow-inner dark:border-white/10"
        style={{ zIndex: 0 }}
      />
    </div>
  );
}

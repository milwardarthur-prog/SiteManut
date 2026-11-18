"use client";

// Mapa do OpenStreetMap (Leaflet). Só desenha: os pinos e os popups vêm
// prontos do mapa-client.tsx. Carregado com ssr:false porque o Leaflet usa
// `window`.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = {
  key: string;
  lat: number;
  lng: number;
  /** Linhas escritas no pino (códigos dos equipamentos; a última pode ser "+N"). */
  labels: string[];
  color: string;
  approximate: boolean;
  popupHtml: string;
};

type Props = {
  pins: MapPin[];
  /** Muda quando o mapa deve reenquadrar os pinos (filtro novo, primeira carga). */
  fitSignal: number;
  /** Pinos arrastáveis, pra corrigir a posição. */
  editMode: boolean;
  focusKey: { key: string; n: number } | null;
  onMove: (key: string, lat: number, lng: number) => void;
};

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Etiqueta com o código do equipamento, centrada na coordenada (o iconSize 0x0
// deixa o tamanho por conta do texto).
function pinIcon(p: MapPin) {
  const border = p.approximate ? "2px dashed #1f2937" : "2px solid #fff";
  const lines = p.labels.map((l) => `<div>${escHtml(l)}</div>`).join("");
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -12],
    html: `<div style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;box-sizing:border-box;border-radius:8px;background:${p.color};color:#fff;border:${border};box-shadow:0 1px 5px rgba(0,0,0,.55);padding:2px 7px;font:700 11px/1.3 sans-serif;text-align:center">${lines}</div>`,
  });
}

export default function MapView({ pins, fitSignal, editMode, focusKey, onMove }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const pinsRef = useRef<MapPin[]>(pins);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  pinsRef.current = pins;

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([-21.76, -43.35], 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Redesenha os pinos quando a lista (ou o modo de edição) muda.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const p of pins) {
      const marker = L.marker([p.lat, p.lng], { icon: pinIcon(p), draggable: editMode, riseOnHover: true });
      marker.bindPopup(p.popupHtml, { maxWidth: 340 });
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        onMoveRef.current(p.key, ll.lat, ll.lng);
      });
      marker.addTo(layer);
      markersRef.current.set(p.key, marker);
    }
  }, [pins, editMode]);

  // Reenquadra o mapa nos pinos visíveis.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pinsRef.current.length === 0) return;
    const bounds = L.latLngBounds(pinsRef.current.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [fitSignal]);

  // Foca num pino (clique na lista).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusKey) return;
    const marker = markersRef.current.get(focusKey.key);
    if (!marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
    marker.openPopup();
  }, [focusKey]);

  return <div ref={elRef} className="w-full h-full rounded-lg border z-0" />;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPin, Move, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MapPin as Pin } from "./map-view";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-lg border flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-green-500" />
    </div>
  ),
});

type Maintenance = "VENCIDA" | "PROXIMA" | "EM_DIA" | "SEM_DADO";
type Item = {
  id: string;
  equipmentNumber: string;
  name: string;
  model: string | null;
  client: string;
  address: string | null;
  state: "LOCALIZADO" | "PENDENTE" | "NAO_ACHADO" | "SEM_ENDERECO";
  lat: number | null;
  lng: number | null;
  precision: "EXATO" | "RUA" | "CEP" | "CIDADE" | "MANUAL" | null;
  currentHorimeter: number;
  hoursRemaining: number | null;
  maintenance: Maintenance;
};

const COLORS: Record<Maintenance, string> = {
  VENCIDA: "#dc2626",
  PROXIMA: "#f59e0b",
  EM_DIA: "#16a34a",
  SEM_DADO: "#6b7280",
};
const SEVERITY: Maintenance[] = ["VENCIDA", "PROXIMA", "EM_DIA", "SEM_DADO"];
const PRECISION_LABEL: Record<string, string> = {
  RUA: "só a rua/rodovia foi encontrada",
  CEP: "posição pelo CEP",
  CIDADE: "só a cidade foi encontrada",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmtHours = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function maintenanceText(i: Item): string {
  if (i.hoursRemaining == null) return "sem dados de manutenção";
  if (i.hoursRemaining < 0) return `manutenção vencida há ${fmtHours(-i.hoursRemaining)} h`;
  return `faltam ${fmtHours(i.hoursRemaining)} h p/ manutenção`;
}

function popupHtml(group: Item[], lat: number, lng: number, approximateNote: string | null): string {
  const clients = Array.from(new Set(group.map((g) => g.client)));
  const addresses = Array.from(new Set(group.map((g) => g.address).filter(Boolean) as string[]));
  const rows = group
    .map((g) => {
      const c = COLORS[g.maintenance];
      return `<li style="margin:3px 0"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px"></span><b>${esc(g.equipmentNumber)}</b>${
        clients.length > 1 ? ` <span style="color:#6b7280">· ${esc(g.client)}</span>` : ""
      }<br><span style="color:#6b7280;font-size:12px;margin-left:15px">${esc(maintenanceText(g))}</span></li>`;
    })
    .join("");
  return `<div style="font:13px/1.35 sans-serif;min-width:230px">
    ${clients.length === 1 ? `<div style="font-weight:700;font-size:14px;margin-bottom:2px">${esc(clients[0])}</div>` : ""}
    ${addresses.map((a) => `<div style="color:#6b7280;font-size:12px;margin-bottom:4px">${esc(a)}</div>`).join("")}
    ${approximateNote ? `<div style="background:#fef3c7;color:#92400e;border-radius:4px;padding:3px 6px;font-size:12px;margin:4px 0">Posição aproximada (${esc(approximateNote)}). Use "Ajustar pinos" pra corrigir.</div>` : ""}
    <ul style="list-style:none;margin:6px 0 8px;padding:0">${rows}</ul>
    <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener noreferrer" style="color:#16a34a;font-weight:600">Traçar rota</a>
  </div>`;
}

export default function MapaClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const [clientQ, setClientQ] = useState("");
  const [equipQ, setEquipQ] = useState("");
  const [maintQ, setMaintQ] = useState<"" | "ATENCAO" | "VENCIDA">("");
  const [editMode, setEditMode] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [focusKey, setFocusKey] = useState<{ key: string; n: number } | null>(null);
  const [fixDrafts, setFixDrafts] = useState<Record<string, string>>({});
  const [fixing, setFixing] = useState<string | null>(null);
  const geocodeRunning = useRef(false);

  const load = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch("/api/mapa");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao carregar o mapa");
        return 0;
      }
      setItems(data.items);
      setError(null);
      return data.pending as number;
    } catch {
      setError("Falha de conexão.");
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca no OpenStreetMap os endereços que ainda não têm posição (em lotes,
  // porque ele limita a 1 consulta por segundo) e atualiza o mapa a cada lote.
  const geocode = useCallback(
    async (retryFailed = false) => {
      if (geocodeRunning.current) return;
      geocodeRunning.current = true;
      setGeocoding(true);
      try {
        // O OpenStreetMap às vezes demora ou recusa uma consulta: tenta de novo
        // algumas vezes antes de desistir (o que faltou fica pro "Continuar buscando").
        let stalls = 0;
        for (let i = 0; i < 120 && stalls < 4; i++) {
          const res = await fetch("/api/mapa/geocodificar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ retryFailed: retryFailed && i === 0 }),
          });
          const data = await res.json();
          if (!res.ok) {
            toast.error(data.error || "Erro ao localizar os endereços.");
            break;
          }
          setRemaining(data.remaining);
          await load();
          if (data.remaining === 0) break;
          stalls = data.done > 0 ? 0 : stalls + 1;
          if (data.networkError && stalls >= 4) {
            toast.error("O OpenStreetMap não está respondendo. Os endereços que faltam podem ser buscados depois.");
          }
        }
      } catch {
        toast.error("Falha de conexão ao localizar endereços.");
      } finally {
        geocodeRunning.current = false;
        setGeocoding(false);
        setRemaining(0);
        setFitSignal((n) => n + 1);
      }
    },
    [load]
  );

  useEffect(() => {
    (async () => {
      const pending = await load();
      setFitSignal((n) => n + 1);
      if (pending > 0) geocode();
    })();
  }, [load, geocode]);

  // Reenquadra o mapa quando o filtro muda.
  useEffect(() => {
    setFitSignal((n) => n + 1);
  }, [clientQ, equipQ, maintQ]);

  const filtered = useMemo(() => {
    const c = clientQ.trim().toLowerCase();
    const q = equipQ.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!c || i.client.toLowerCase().includes(c)) &&
        (!q || i.equipmentNumber.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) &&
        (!maintQ ||
          (maintQ === "VENCIDA" ? i.maintenance === "VENCIDA" : i.maintenance === "VENCIDA" || i.maintenance === "PROXIMA"))
    );
  }, [items, clientQ, equipQ, maintQ]);

  // Um pino por posição: equipamentos no mesmo lugar ficam juntos.
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of filtered) {
      if (i.state !== "LOCALIZADO" || i.lat == null || i.lng == null) continue;
      const key = `${i.lat.toFixed(4)},${i.lng.toFixed(4)}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(i);
    }
    return Array.from(map.entries()).map(([key, group]) => {
      const worst = SEVERITY.find((s) => group.some((g) => g.maintenance === s)) ?? "SEM_DADO";
      const approx = group.find((g) => g.precision && PRECISION_LABEL[g.precision]);
      return { key, group, worst, approxNote: approx?.precision ? PRECISION_LABEL[approx.precision] : null };
    });
  }, [filtered]);

  const pins: Pin[] = useMemo(
    () =>
      groups.map(({ key, group, worst, approxNote }) => {
        const lat = group[0].lat as number;
        const lng = group[0].lng as number;
        return {
          key,
          lat,
          lng,
          labels:
            group.length > 3
              ? [...group.slice(0, 2).map((g) => g.equipmentNumber), `+${group.length - 2}`]
              : group.map((g) => g.equipmentNumber),
          color: COLORS[worst],
          approximate: !!approxNote,
          popupHtml: popupHtml(group, lat, lng, approxNote),
        };
      }),
    [groups]
  );

  // Equipamentos sem posição: sem endereço, ou endereço que o mapa não achou.
  const unlocated = useMemo(() => {
    const rows = new Map<string, { id: string; label: string; equipments: Item[]; address: string | null }>();
    for (const i of filtered) {
      if (i.state !== "NAO_ACHADO" && i.state !== "SEM_ENDERECO") continue;
      const key = i.state === "NAO_ACHADO" ? `a:${i.address}` : `e:${i.id}`;
      const row = rows.get(key) ?? { id: key, label: i.client, equipments: [], address: i.address };
      row.equipments.push(i);
      rows.set(key, row);
    }
    return Array.from(rows.values());
  }, [filtered]);

  const pendingCount = useMemo(() => filtered.filter((i) => i.state === "PENDENTE").length, [filtered]);

  const clientOptions = useMemo(() => Array.from(new Set(items.map((i) => i.client))).sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);

  const moveMarker = async (key: string, lat: number, lng: number) => {
    const g = groups.find((x) => x.key === key);
    if (!g) return;
    const addresses = Array.from(new Set(g.group.map((i) => i.address).filter(Boolean) as string[]));
    try {
      const res = await fetch("/api/mapa/localizar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses, lat, lng }),
      });
      if (!res.ok) throw new Error();
      toast.success("Posição salva.");
    } catch {
      toast.error("Não consegui salvar a nova posição.");
    }
    await load();
  };

  const fix = async (rowId: string, equipmentIds: string[]) => {
    const input = (fixDrafts[rowId] ?? "").trim();
    if (!input) return;
    setFixing(rowId);
    try {
      const res = await fetch("/api/mapa/localizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentIds, input }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao localizar.");
      } else if (!data.found) {
        toast.error("Não encontrei esse endereço. Tente outro ou cole as coordenadas do Google Maps.");
      } else {
        toast.success("Localizado.");
        setFixDrafts((s) => ({ ...s, [rowId]: "" }));
        await load();
        setFitSignal((n) => n + 1);
      }
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setFixing(null);
    }
  };

  const hasFilter = !!(clientQ || equipQ || maintQ);
  const failedCount = items.filter((i) => i.state === "NAO_ACHADO").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-green-500" /> Mapa de equipamentos
        </h1>
        <p className="text-sm text-gray-500">
          Onde estão os equipamentos locados. {filtered.length} equipamento(s) · {pins.length} local(is) no mapa
          {unlocated.length > 0 && ` · ${unlocated.length} sem localização`}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9" list="mapa-clientes" placeholder="Filtrar por cliente" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
          </div>
          <datalist id="mapa-clientes">
            {clientOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="w-full sm:w-56">
          <label className="block text-xs font-medium text-gray-600 mb-1">Equipamento</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9" list="mapa-equipamentos" placeholder="Ex.: GE-34-115" value={equipQ} onChange={(e) => setEquipQ(e.target.value)} />
          </div>
          <datalist id="mapa-equipamentos">
            {items.map((i) => (
              <option key={i.id} value={i.equipmentNumber} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Manutenção</label>
          <select className="border rounded-md px-3 py-2 text-sm bg-white h-10" value={maintQ} onChange={(e) => setMaintQ(e.target.value as any)}>
            <option value="">Todas</option>
            <option value="ATENCAO">Vencida ou próxima (&lt; 50 h)</option>
            <option value="VENCIDA">Só vencida</option>
          </select>
        </div>
        {hasFilter && (
          <Button variant="ghost" className="gap-1 text-gray-500" onClick={() => { setClientQ(""); setEquipQ(""); setMaintQ(""); }}>
            <X className="w-4 h-4" /> Limpar filtros
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant={editMode ? "default" : "outline"}
            className={`gap-1 ${editMode ? "bg-green-500 hover:bg-green-600" : ""}`}
            onClick={() => setEditMode((v) => !v)}
          >
            <Move className="w-4 h-4" /> {editMode ? "Pronto" : "Ajustar pinos"}
          </Button>
        </div>
      </div>

      {editMode && (
        <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-3 py-2">
          Arraste um pino até o lugar certo. A nova posição é salva na hora e vale também nas próximas importações.
        </div>
      )}

      {geocoding && (
        <div className="rounded-lg border bg-white text-sm text-gray-600 px-3 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-green-500" />
          Localizando endereços novos{remaining > 0 ? ` — faltam ${remaining}` : ""}… (o OpenStreetMap atende 1 por segundo)
        </div>
      )}
      {!geocoding && pendingCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2 flex items-center gap-2">
          {pendingCount} equipamento(s) ainda sem posição.
          <Button size="sm" variant="outline" className="gap-1" onClick={() => geocode()}>
            <RefreshCw className="w-3.5 h-3.5" /> Continuar buscando
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[65vh] min-h-[420px]">
          <MapView pins={pins} fitSignal={fitSignal} editMode={editMode} focusKey={focusKey} onMove={moveMarker} />
        </div>

        {/* Lista lateral */}
        <div className="rounded-lg border bg-white lg:h-[65vh] overflow-y-auto divide-y">
          {groups.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              {hasFilter ? "Nenhum equipamento com esse filtro." : "Nenhum equipamento locado com posição no mapa."}
            </div>
          )}
          {groups
            .slice()
            .sort((a, b) => a.group[0].client.localeCompare(b.group[0].client, "pt-BR"))
            .map(({ key, group, worst }) => (
              <button
                key={key}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
                onClick={() => setFocusKey({ key, n: Date.now() })}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[worst] }} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {Array.from(new Set(group.map((g) => g.client))).join(" · ")}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{group[0].address ?? "—"}</div>
                    <div className="text-xs text-gray-700 mt-0.5 flex flex-wrap gap-x-2">
                      {group.map((g) => (
                        <span key={g.id} className="font-mono">{g.equipmentNumber}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        {SEVERITY.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[s] }} />
            {{ VENCIDA: "Manutenção vencida", PROXIMA: "Manutenção em menos de 50 h", EM_DIA: "Em dia", SEM_DADO: "Sem dados de manutenção" }[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-gray-300 border-2 border-dashed border-gray-800" />
          Posição aproximada
        </span>
        <span>Vários equipamentos no mesmo local ficam empilhados no mesmo pino.</span>
      </div>

      {/* Sem localização */}
      {(unlocated.length > 0 || failedCount > 0) && (
        <div className="rounded-lg border bg-white">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Sem localização ({unlocated.length})</h2>
              <p className="text-xs text-gray-500">
                O endereço não existe no cadastro ou o OpenStreetMap não achou. Digite um endereço melhor ou cole as
                coordenadas do Google Maps (clique direito no local → copiar coordenadas).
              </p>
            </div>
            {failedCount > 0 && (
              <Button size="sm" variant="outline" className="gap-1" disabled={geocoding} onClick={() => geocode(true)}>
                <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo os não encontrados
              </Button>
            )}
          </div>
          <div className="divide-y">
            {unlocated.map((row) => (
              <div key={row.id} className="px-4 py-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{row.label}</div>
                  <div className="text-xs font-mono text-gray-600">{row.equipments.map((e) => e.equipmentNumber).join(", ")}</div>
                  <div className="text-xs text-gray-500 truncate">{row.address ? `Endereço atual: ${row.address}` : "Sem endereço no cadastro"}</div>
                </div>
                <Input
                  placeholder="Endereço completo ou coordenadas (-21.76, -43.35)"
                  value={fixDrafts[row.id] ?? ""}
                  onChange={(e) => setFixDrafts((s) => ({ ...s, [row.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && fix(row.id, row.equipments.map((x) => x.id))}
                />
                <Button
                  size="sm"
                  className="bg-green-500 hover:bg-green-600"
                  disabled={fixing === row.id || !(fixDrafts[row.id] ?? "").trim()}
                  onClick={() => fix(row.id, row.equipments.map((x) => x.id))}
                >
                  {fixing === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Localizar"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

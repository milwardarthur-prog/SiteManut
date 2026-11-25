"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpFromLine, ClipboardCopy, Loader2, Pencil, Plus, RotateCw, Search, Shuffle, Trash2, Truck, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  centerOfGravity,
  distributePack,
  findSpot,
  isValidPlacement,
  overhangOf,
  type Bed,
  type DistributeMode,
  type Rect,
  type Vehicle,
} from "@/lib/carga";

type Eq = {
  id: string;
  equipmentNumber: string;
  name: string;
  model: string | null;
  leaseStatus: "DISPONIVEL" | "LOCADO" | "MANUTENCAO" | null; // null: item extra (ex.: bacia)
  client: string | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  weightKg: number | null;
};
// slot: em qual veículo da carga o item está (undefined = escolhido, mas ainda "sem veículo").
// x/y = null: no veículo (ou sem veículo), mas sem lugar na carroceria.
// inBasin: o gerador está dentro de uma bacia (uid do item-bacia); ele anda, gira e
// pesa junto com ela, e não ocupa piso próprio. inRot: gerador girado dentro da bacia.
type Item = {
  uid: string;
  eqId: string;
  slot?: string;
  x: number | null;
  y: number | null;
  rotated: boolean;
  inBasin?: string;
  inRot?: boolean;
};
// Um veículo da carga. O mesmo veículo cadastrado pode entrar mais de uma vez (cada vez é um "slot").
type SlotCfg = { key: string; vehicleId: string; overhangOn: boolean; overhangStr: string };
type SlotInfo = { cfg: SlotCfg; idx: number; vehicle: Vehicle; bed: Bed; overhangM: number };
// Item sendo arrastado pra fora da carroceria de origem (pra outro veículo ou pro grupo "sem veículo").
type Hover = { target: string; targetLabel: string; x: number; y: number; label: string } | null;

const fmt = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const fmtKg = (n: number) => `${Math.round(n).toLocaleString("pt-BR")} kg`;
const SNAP_M = 0.1;
const POOL = "pool";
const STATUS_LABEL = { DISPONIVEL: "Disponível", LOCADO: "Locado", MANUTENCAO: "Manutenção" } as const;
const STATUS_DOT = { DISPONIVEL: "bg-green-500", LOCADO: "bg-blue-500", MANUTENCAO: "bg-amber-500" } as const;

const hasDims = (e: Eq) => e.lengthM != null && e.widthM != null;
const isBasinEq = (e: Eq | undefined) => !!e && e.equipmentNumber.startsWith("BC");
const FIT_EPS = 1e-6;
/** Orientação do gerador dentro da bacia: false = alinhado, true = girado 90°, null = não cabe. */
function basinFit(g: Eq, b: Eq): boolean | null {
  if (!hasDims(g) || !hasDims(b)) return null;
  if (g.lengthM! <= b.lengthM! + FIT_EPS && g.widthM! <= b.widthM! + FIT_EPS) return false;
  if (g.widthM! <= b.lengthM! + FIT_EPS && g.lengthM! <= b.widthM! + FIT_EPS) return true;
  return null;
}
const itemSize = (e: Eq, rotated: boolean) =>
  rotated ? { w: e.widthM as number, h: e.lengthM as number } : { w: e.lengthM as number, h: e.widthM as number };

/** Tamanho (em tela, em metros) do gerador dentro da bacia: acompanha o giro da bacia. */
function genScreenDims(basin: Item, gen: Item, ge: Eq) {
  const w0 = gen.inRot ? ge.widthM! : ge.lengthM!;
  const h0 = gen.inRot ? ge.lengthM! : ge.widthM!;
  return basin.rotated ? { gw: h0, gh: w0 } : { gw: w0, gh: h0 };
}

function itemColor(code: string): string {
  if (code.startsWith("BC")) return "#0d9488";
  if (code.startsWith("MTS")) return "#ea580c";
  if (code.startsWith("TL")) return "#7c3aed";
  return "#2563eb";
}

const newKey = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const defaultCfg = (vehicleId: string): SlotCfg => ({ key: newKey(), vehicleId, overhangOn: false, overhangStr: "1,00" });
const overhangOfCfg = (c: SlotCfg) => {
  if (!c.overhangOn) return 0;
  const n = Number(c.overhangStr.replace(",", "."));
  return Number.isFinite(n) ? Math.min(3, Math.max(0, n)) : 0;
};
const bedOf = (v: Vehicle, c: SlotCfg): Bed => ({ lengthM: v.lengthM, widthM: v.widthM, overhangM: overhangOfCfg(c) });
const storageKey = (readOnly: boolean) => `sitemanut:carga:${readOnly ? "pub" : "app"}:v2`;

function rectOfItem(it: Item, eqById: Map<string, Eq>): Rect | null {
  const e = eqById.get(it.eqId);
  if (!e || !hasDims(e) || it.x == null || it.y == null) return null;
  const { w, h } = itemSize(e, it.rotated);
  return { x: it.x, y: it.y, w, h };
}

/** Resumo de um veículo: `items` são só os dele. */
function computeSummary(items: Item[], vehicle: Vehicle, bed: Bed, eqById: Map<string, Eq>) {
  const rectOf = (i: Item) => rectOfItem(i, eqById);
  const placed = items
    .map((i) => ({ i, e: eqById.get(i.eqId), r: rectOf(i) }))
    .filter((p): p is { i: Item; e: Eq; r: Rect } => !!p.e && !!p.r);
  // gerador dentro de bacia: conta peso, centro de gravidade e altura, mas usa o piso da bacia
  const nestedPlaced = items
    .filter((i) => i.inBasin)
    .map((i) => {
      const parent = items.find((p) => p.uid === i.inBasin);
      const pr = parent ? rectOf(parent) : null;
      return { i, e: eqById.get(i.eqId), r: pr, basinEq: parent ? eqById.get(parent.eqId) : undefined };
    })
    .filter((p): p is { i: Item; e: Eq; r: Rect; basinEq: Eq | undefined } => !!p.e && !!p.r);
  const pending = items.filter((i) => i.x == null && !i.inBasin);
  const area = placed.reduce((s, p) => s + p.r.w * p.r.h, 0);
  const weighed = [...placed, ...nestedPlaced];
  const weight = weighed.reduce((s, p) => s + (p.e.weightKg ?? 0), 0);
  const noWeight = weighed.filter((p) => p.e.weightKg == null).length;
  const tooTall = vehicle.heightM
    ? [
        ...placed.filter((p) => p.e.heightM != null && p.e.heightM > vehicle.heightM!),
        // gerador sobre bacia: soma a altura da bacia (se conhecida)
        ...nestedPlaced.filter((p) => p.e.heightM != null && p.e.heightM + (p.basinEq?.heightM ?? 0) > vehicle.heightM!),
      ]
    : [];
  const cg = centerOfGravity(
    weighed.map((p) => ({ x: p.r.x, w: p.r.w, weightKg: p.e.weightKg ?? 0 })),
    bed.lengthM
  );
  const overhanging = placed
    .map((p) => ({ p, oh: overhangOf(p.r, bed) }))
    .filter((x) => x.oh.any)
    .map(({ p, oh }) => ({
      code: p.e.equipmentNumber + nestedPlaced.filter((n) => n.i.inBasin === p.i.uid).map((n) => ` + ${n.e.equipmentNumber}`).join(""),
      text: [
        oh.rear > 0.004 ? `${fmt(oh.rear)} m atrás` : "",
        oh.sideA > 0.004 ? `${fmt(oh.sideA)} m pra um lado` : "",
        oh.sideB > 0.004 ? `${fmt(oh.sideB)} m pro outro lado` : "",
      ]
        .filter(Boolean)
        .join(" e "),
    }));
  return { placed, nestedPlaced, pending, area, areaPct: area / (bed.lengthM * bed.widthM), weight, noWeight, tooTall, cg, overhanging };
}
type Summary = ReturnType<typeof computeSummary>;

// readOnly: versão pública (aba do painel estático) — só consulta e monta a carga; veículos,
// medidas e pesos se editam no SiteManut. Não mostra cliente nem status de locação.
export default function CargaClient({ readOnly = false }: { readOnly?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [equipments, setEquipments] = useState<Eq[]>([]);
  const [slots, setSlots] = useState<SlotCfg[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyWithDims, setOnlyWithDims] = useState(false);
  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [editEqId, setEditEqId] = useState<string | null>(null);
  // último "Organizar" (pra "Outra sugestão" repetir o modo com um arranjo diferente)
  const [lastOrg, setLastOrg] = useState<{ mode: DistributeMode; variant: number } | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const hydrated = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(readOnly ? "/api/public/carga" : "/api/carga");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao carregar");
        return;
      }
      setVehicles(data.vehicles);
      setEquipments(data.equipments);
      if (!hydrated.current) {
        // primeira carga: recupera a montagem que ficou guardada no navegador
        hydrated.current = true;
        let saved: any = null;
        try {
          saved = JSON.parse(localStorage.getItem(storageKey(readOnly)) || "null");
        } catch {
          saved = null;
        }
        const vIds = new Set<string>(data.vehicles.map((v: Vehicle) => v.id));
        const eIds = new Set<string>(data.equipments.map((e: Eq) => e.id));
        let sl: SlotCfg[] = Array.isArray(saved?.slots)
          ? saved.slots
              .filter((s: any) => s && typeof s.key === "string" && vIds.has(s.vehicleId))
              .map((s: any) => ({
                key: s.key,
                vehicleId: s.vehicleId,
                overhangOn: !!s.overhangOn,
                overhangStr: typeof s.overhangStr === "string" ? s.overhangStr : "1,00",
              }))
          : [];
        if (sl.length === 0 && data.vehicles[0]) sl = [defaultCfg(data.vehicles[0].id)];
        const keys = new Set(sl.map((s) => s.key));
        const its: Item[] = Array.isArray(saved?.items)
          ? saved.items
              .filter((i: any) => i && typeof i.uid === "string" && eIds.has(i.eqId))
              .map((i: any) => {
                const slot = typeof i.slot === "string" && keys.has(i.slot) ? i.slot : undefined;
                return {
                  uid: i.uid,
                  eqId: i.eqId,
                  slot,
                  x: slot && typeof i.x === "number" ? i.x : null,
                  y: slot && typeof i.y === "number" ? i.y : null,
                  rotated: slot ? !!i.rotated : false,
                  inBasin: typeof i.inBasin === "string" ? i.inBasin : undefined,
                  inRot: i.inRot === undefined ? undefined : !!i.inRot,
                } as Item;
              })
          : [];
        setSlots(sl);
        setItems(its);
        const lo = saved?.lastOrg;
        if (lo && (lo.mode === "FILL" || lo.mode === "BALANCE") && typeof lo.variant === "number") setLastOrg({ mode: lo.mode, variant: lo.variant });
      }
      setError(null);
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }, [readOnly]);
  useEffect(() => {
    load();
  }, [load]);

  const eqById = useMemo(() => new Map(equipments.map((e) => [e.id, e])), [equipments]);
  const vehById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  // Depois de recarregar (cadastro de veículos/medidas mudou): tira o que deixou de existir.
  useEffect(() => {
    if (!hydrated.current || loading) return;
    const validSlots = slots.filter((s) => vehById.has(s.vehicleId));
    if (validSlots.length !== slots.length) {
      setSlots(validSlots);
      return;
    }
    if (validSlots.length === 0 && vehicles.length > 0) {
      setSlots([defaultCfg(vehicles[0].id)]);
      return;
    }
    const keys = new Set(validSlots.map((s) => s.key));
    const uids = new Set(items.map((i) => i.uid));
    let changed = false;
    const next: Item[] = [];
    for (const i of items) {
      if (!eqById.has(i.eqId)) {
        changed = true;
        continue;
      }
      let it = i;
      if (it.slot && !keys.has(it.slot)) {
        it = { ...it, slot: undefined, x: null, y: null, rotated: false };
        changed = true;
      }
      if (it.inBasin && !uids.has(it.inBasin)) {
        it = { ...it, inBasin: undefined, inRot: undefined, x: null, y: null };
        changed = true;
      }
      next.push(it);
    }
    if (changed) setItems(next);
  }, [loading, slots, items, vehicles, vehById, eqById]);

  // guarda a montagem no navegador
  useEffect(() => {
    if (!hydrated.current || loading) return;
    try {
      localStorage.setItem(storageKey(readOnly), JSON.stringify({ slots, items, lastOrg }));
    } catch {
      /* sem espaço / navegação privada: segue sem guardar */
    }
  }, [slots, items, lastOrg, loading, readOnly]);

  const slotInfos: SlotInfo[] = useMemo(
    () =>
      slots
        .map((cfg, idx) => {
          const vehicle = vehById.get(cfg.vehicleId);
          return vehicle ? { cfg, idx, vehicle, bed: bedOf(vehicle, cfg), overhangM: overhangOfCfg(cfg) } : null;
        })
        .filter((s): s is SlotInfo => s !== null),
    [slots, vehById]
  );
  const itemsBySlot = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) if (i.slot) m.set(i.slot, [...(m.get(i.slot) ?? []), i]);
    return m;
  }, [items]);
  const summaries = useMemo(() => {
    const m = new Map<string, Summary>();
    for (const s of slotInfos) m.set(s.cfg.key, computeSummary(itemsBySlot.get(s.cfg.key) ?? [], s.vehicle, s.bed, eqById));
    return m;
  }, [slotInfos, itemsBySlot, eqById]);
  // "sem veículo": escolhidos, ainda sem veículo (gerador dentro de bacia vai junto com a bacia)
  const poolItems = useMemo(() => items.filter((i) => !i.slot && !i.inBasin), [items]);
  const slotLabel = (s: SlotInfo) => `${s.idx + 1}. ${s.vehicle.name}`;
  const multi = slotInfos.length > 1;

  // ── ações gerais ──
  const removeItem = useCallback((uid: string) => {
    // se tirou uma bacia, o gerador que estava nela vira "ficou de fora" (não some sem avisar)
    setItems((all) =>
      all.filter((i) => i.uid !== uid).map((i) => (i.inBasin === uid ? { ...i, inBasin: undefined, inRot: undefined, x: null, y: null } : i))
    );
    setSelected((s) => (s === uid ? null : s));
  }, []);

  const toggleEquipment = (eq: Eq) => {
    const existing = items.find((i) => i.eqId === eq.id);
    if (existing) {
      removeItem(existing.uid);
      return;
    }
    if (slotInfos.length === 0) {
      toast.error("Cadastre um veículo primeiro.");
      return;
    }
    if (!hasDims(eq)) {
      if (readOnly) {
        toast.info(`${eq.equipmentNumber} ainda não tem medidas cadastradas. Cadastre no SiteManut.`);
      } else {
        setEditEqId(eq.id);
        toast.info("Informe as medidas deste equipamento para colocá-lo na carga.");
      }
      return;
    }
    const uid = `${eq.id}-${Date.now()}`;
    if (slotInfos.length === 1) {
      // um veículo só: já encaixa direto (sem passar pelo "sem veículo")
      const s = slotInfos[0];
      const rects = (itemsBySlot.get(s.cfg.key) ?? []).map((i) => rectOfItem(i, eqById)).filter((r): r is Rect => r !== null);
      const size = { w: eq.lengthM as number, h: eq.widthM as number };
      const spot =
        findSpot(size, rects, { lengthM: s.bed.lengthM, widthM: s.bed.widthM }) ?? (s.overhangM > 0 ? findSpot(size, rects, s.bed) : null);
      if (!spot) {
        setItems((all) => [...all, { uid, eqId: eq.id, slot: s.cfg.key, x: null, y: null, rotated: false }]);
        toast.error(`${eq.equipmentNumber} não coube. Ficou em "Ficaram de fora". Tente "Organizar" ou outro veículo.`);
        return;
      }
      setItems((all) => [...all, { uid, eqId: eq.id, slot: s.cfg.key, x: spot.x, y: spot.y, rotated: spot.rotated }]);
      setSelected(uid);
      return;
    }
    setItems((all) => [...all, { uid, eqId: eq.id, x: null, y: null, rotated: false }]);
  };

  /** Organiza tudo que está na carga (incluindo o que está "sem veículo") entre os veículos. */
  const organize = (mode: DistributeMode, variant: number) => {
    if (slotInfos.length === 0) return;
    // bacia com gerador dentro = uma unidade só (ocupa a bacia; o peso é a soma)
    const nestedWeight = new Map<string, number>();
    for (const i of items) {
      if (i.inBasin) nestedWeight.set(i.inBasin, (nestedWeight.get(i.inBasin) ?? 0) + (eqById.get(i.eqId)?.weightKg ?? 0));
    }
    const pack = items
      .filter((i) => !i.inBasin)
      .map((i) => ({ i, e: eqById.get(i.eqId) }))
      .filter((p): p is { i: Item; e: Eq } => !!p.e && hasDims(p.e))
      .map(({ i, e }) => ({
        id: i.uid,
        w: e.lengthM as number,
        h: e.widthM as number,
        weightKg: (e.weightKg ?? 0) + (nestedWeight.get(i.uid) ?? 0),
      }));
    const result = distributePack(
      pack,
      slotInfos.map((s) => ({ key: s.cfg.key, bed: s.bed, maxWeightKg: s.vehicle.capacityKg })),
      mode,
      variant
    );
    const packedIds = new Set(pack.map((p) => p.id));
    // com um veículo só, o que não coube fica "de fora" dele; com vários, volta pro "sem veículo"
    const leftoverSlot = slotInfos.length === 1 ? slotInfos[0].cfg.key : undefined;
    setItems((all) =>
      all.map((i) => {
        if (i.inBasin) return { ...i, slot: result.assigned.get(i.inBasin)?.slotKey ?? (packedIds.has(i.inBasin) ? leftoverSlot : i.slot) };
        const a = result.assigned.get(i.uid);
        if (a) return { ...i, slot: a.slotKey, x: a.x, y: a.y, rotated: a.rotated };
        if (!packedIds.has(i.uid)) return i; // sem medidas: não dá pra posicionar
        return { ...i, slot: leftoverSlot, x: null, y: null, rotated: false };
      })
    );
    setLastOrg({ mode, variant });
    if (result.notFit.length > 0) {
      toast.error(
        `${result.notFit.length} equipamento(s) ficaram de fora: sem espaço ou acima da capacidade ${slotInfos.length > 1 ? "dos veículos" : "do veículo"}.`
      );
    } else if (slotInfos.length > 1) {
      const used = new Set([...result.assigned.values()].map((a) => a.slotKey)).size;
      toast.success(`Carga distribuída em ${used} de ${slotInfos.length} veículos.`);
    } else {
      toast.success("Carga organizada.");
    }
  };

  const addSlot = (vehicleId: string) => {
    if (!vehById.has(vehicleId)) return;
    setSlots((s) => [...s, defaultCfg(vehicleId)]);
  };

  const removeSlot = (key: string) => {
    if (slots.length <= 1) return;
    const inside = items.filter((i) => i.slot === key).length;
    // o que estava nesse veículo volta pro "sem veículo" (nada some sem avisar)
    setItems((all) => all.map((i) => (i.slot === key ? { ...i, slot: undefined, x: null, y: null, rotated: false } : i)));
    setSlots((s) => s.filter((c) => c.key !== key));
    if (inside > 0) toast.info(`${inside} item(ns) voltaram pra "Sem veículo".`);
  };

  // trocar o veículo de um slot: o que deixou de caber fica "de fora" desse veículo
  const changeSlotVehicle = (key: string, vehicleId: string) => {
    const cfg = slots.find((s) => s.key === key);
    const v = vehById.get(vehicleId);
    if (!cfg || !v) return;
    const nb = bedOf(v, cfg);
    let lost = 0;
    const kept: Rect[] = [];
    const next = items.map((i) => {
      if (i.slot !== key) return i;
      const r = rectOfItem(i, eqById);
      if (r && isValidPlacement(r, kept, nb)) {
        kept.push(r);
        return i;
      }
      if (r) lost++;
      return { ...i, x: null, y: null };
    });
    setItems(next);
    setSlots((s) => s.map((c) => (c.key === key ? { ...c, vehicleId } : c)));
    if (lost > 0) toast.info(`${lost} equipamento(s) não cabem na posição atual no novo veículo. Use "Organizar".`);
  };

  const changeOverhang = (key: string, patch: Partial<Pick<SlotCfg, "overhangOn" | "overhangStr">>) => {
    const cfg = slots.find((s) => s.key === key);
    const vehicle = cfg && vehById.get(cfg.vehicleId);
    setSlots((s) => s.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    // Ao desligar, o que estava passando pra fora perde o lugar (volta pra "ficaram de fora").
    if (patch.overhangOn === false && vehicle) {
      const strict: Bed = { lengthM: vehicle.lengthM, widthM: vehicle.widthM };
      // calculado fora do setItems pra não contar duas vezes (o React pode repetir a atualização)
      let lost = 0;
      const next = items.map((i) => {
        if (i.slot !== key) return i;
        const r = rectOfItem(i, eqById);
        if (r && !isValidPlacement(r, [], strict)) {
          lost++;
          return { ...i, x: null, y: null };
        }
        return i;
      });
      setItems(next);
      if (lost > 0) toast.info(`${lost} equipamento(s) estavam fora da carroceria e saíram da carga. Use "Organizar".`);
    }
  };

  /**
   * Leva um item (com o gerador que estiver na bacia) pra outro veículo — ou pro "sem veículo" (target null).
   * `drop` = onde o usuário soltou (em metros, na carroceria de destino); sem ele, vai pro 1º espaço livre.
   */
  const transfer = (uid: string, target: string | null, drop?: { x: number; y: number }): boolean => {
    const unit = items.find((i) => i.uid === uid);
    if (!unit) return false;
    if (target === null) {
      setItems((all) =>
        all.map((i) =>
          i.uid === unit.uid ? { ...i, slot: undefined, x: null, y: null, rotated: false } : i.inBasin === unit.uid ? { ...i, slot: undefined } : i
        )
      );
      setSelected(null);
      return true;
    }
    const info = slotInfos.find((s) => s.cfg.key === target);
    const e = eqById.get(unit.eqId);
    if (!info || !e || !hasDims(e)) return false;
    const others = items
      .filter((i) => i.slot === target && i.uid !== unit.uid)
      .map((i) => rectOfItem(i, eqById))
      .filter((r): r is Rect => r !== null);
    let spot: { x: number; y: number; rotated: boolean } | null = null;
    let exact = false;
    if (drop) {
      const { w, h } = itemSize(e, unit.rotated);
      // soltou com o centro perto da borda: encosta dentro da carroceria em vez de recusar
      const dx = Math.min(Math.max(0, drop.x), Math.max(0, info.bed.lengthM - w));
      const dy = Math.min(Math.max(0, drop.y), Math.max(0, info.bed.widthM - h));
      if (isValidPlacement({ x: dx, y: dy, w, h }, others, info.bed)) {
        spot = { x: dx, y: dy, rotated: unit.rotated };
        exact = true;
      }
    }
    if (!spot) {
      const size = { w: e.lengthM as number, h: e.widthM as number };
      spot =
        findSpot(size, others, { lengthM: info.bed.lengthM, widthM: info.bed.widthM }) ??
        (info.overhangM > 0 ? findSpot(size, others, info.bed) : null);
    }
    if (!spot) {
      toast.error(`${e.equipmentNumber} não coube no veículo ${slotLabel(info)}.`);
      return false;
    }
    if (drop && !exact) toast.info(`Aí não dava: ${e.equipmentNumber} foi pro primeiro espaço livre do veículo ${slotLabel(info)}.`);
    const placed = spot;
    setItems((all) =>
      all.map((i) =>
        i.uid === unit.uid
          ? { ...i, slot: target, x: placed.x, y: placed.y, rotated: placed.rotated }
          : i.inBasin === unit.uid
            ? { ...i, slot: target }
            : i
      )
    );
    setSelected(unit.uid);
    return true;
  };

  const clearAll = () => {
    setItems([]);
    setSelected(null);
    setLastOrg(null);
  };

  const copySummary = async () => {
    const lines: string[] = [];
    let totalWeight = 0;
    for (const s of slotInfos) {
      const sm = summaries.get(s.cfg.key);
      if (!sm) continue;
      totalWeight += sm.weight;
      lines.push(`Carga${multi ? ` — veículo ${s.idx + 1}` : ""} — ${s.vehicle.name} (${fmt(s.vehicle.lengthM)} × ${fmt(s.vehicle.widthM)} m)`);
      lines.push(
        ...sm.placed.map(
          (p) => `• ${p.e.equipmentNumber}${p.e.weightKg != null ? ` — ${fmtKg(p.e.weightKg)}` : ""} (${fmt(p.r.w)} × ${fmt(p.r.h)} m)`
        ),
        ...sm.nestedPlaced.map(
          (p) =>
            `• ${p.e.equipmentNumber}${p.e.weightKg != null ? ` — ${fmtKg(p.e.weightKg)}` : ""} (sobre a bacia ${p.basinEq?.equipmentNumber ?? ""})`
        ),
        `Peso total: ${fmtKg(sm.weight)}${s.vehicle.capacityKg ? ` de ${fmtKg(s.vehicle.capacityKg)}` : ""}`,
        `Ocupação do piso: ${Math.round(sm.areaPct * 100)}%`
      );
      if (sm.overhanging.length > 0) lines.push(`ATENÇÃO — fora da carroceria: ${sm.overhanging.map((o) => `${o.code} (${o.text})`).join("; ")}`);
      if (sm.pending.length > 0) {
        lines.push(`SEM LUGAR neste veículo: ${sm.pending.map((p) => eqById.get(p.eqId)?.equipmentNumber ?? "?").join(", ")}`);
      }
      lines.push("");
    }
    if (poolItems.length > 0) {
      lines.push(`SEM VEÍCULO: ${poolItems.map((p) => eqById.get(p.eqId)?.equipmentNumber ?? "?").join(", ")}`, "");
    }
    if (multi) lines.push(`Peso total de todos os veículos: ${fmtKg(totalWeight)}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      toast.success("Resumo da carga copiado.");
    } catch {
      toast.error("Não consegui copiar.");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipments.filter(
      (e) =>
        (!onlyWithDims || hasDims(e)) &&
        (!q || e.equipmentNumber.toLowerCase().includes(q) || (e.model ?? "").toLowerCase().includes(q) || (e.client ?? "").toLowerCase().includes(q))
    );
  }, [equipments, search, onlyWithDims]);
  const inLoad = useMemo(() => new Set(items.map((i) => i.eqId)), [items]);
  const withDimsCount = equipments.filter(hasDims).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4 text-sm">{error}</div>;

  const totals = (() => {
    let weight = 0;
    let loaded = 0;
    let used = 0;
    let out = poolItems.length;
    for (const s of slotInfos) {
      const sm = summaries.get(s.cfg.key);
      if (!sm) continue;
      weight += sm.weight;
      const n = sm.placed.length + sm.nestedPlaced.length;
      loaded += n;
      if (n > 0) used++;
      out += sm.pending.length;
    }
    return { weight, loaded, used, out };
  })();
  const poolSelect = (u: Item) => {
    const eq = eqById.get(u.eqId);
    const nested = items.filter((i) => i.inBasin === u.uid);
    return {
      code: (eq?.equipmentNumber ?? "?") + nested.map((n) => ` + ${eqById.get(n.eqId)?.equipmentNumber ?? "?"}`).join(""),
      weight: [eq, ...nested.map((n) => eqById.get(n.eqId))].reduce((s, e) => s + (e?.weightKg ?? 0), 0),
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-green-500" /> Montar carga
          </h1>
          <p className="text-sm text-gray-500">
            Marque os equipamentos da operação, escolha um ou mais veículos e use &quot;Organizar&quot; — ou arraste para encaixar. Vista de cima, tudo no chão.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Veículos da carga</label>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-white h-10 min-w-[220px]"
              value=""
              onChange={(e) => e.target.value && addSlot(e.target.value)}
              disabled={vehicles.length === 0}
            >
              <option value="">{vehicles.length === 0 ? "Nenhum veículo cadastrado" : "+ Adicionar veículo…"}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({fmt(v.lengthM)} × {fmt(v.widthM)} m)
                </option>
              ))}
            </select>
          </div>
          {!readOnly && (
            <Button variant="outline" className="gap-1" onClick={() => setVehicleDialog(true)}>
              <Pencil className="w-4 h-4" /> Veículos
            </Button>
          )}
        </div>
      </div>

      {slotInfos.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center">
          <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-3">
            {readOnly
              ? "Nenhum veículo cadastrado ainda. O cadastro é feito no SiteManut."
              : "Cadastre o primeiro veículo, com as medidas da carroceria, para começar."}
          </p>
          {!readOnly && (
            <Button className="bg-green-500 hover:bg-green-600" onClick={() => setVehicleDialog(true)}>
              Cadastrar veículo
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* ── lista de equipamentos ── */}
          <div className="rounded-lg border bg-white flex flex-col lg:h-[78vh] h-[50vh] lg:sticky lg:top-4 lg:self-start">
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input className="pl-9" placeholder={readOnly ? "Buscar equipamento" : "Buscar equipamento ou cliente"} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={onlyWithDims} onChange={(e) => setOnlyWithDims(e.target.checked)} />
                  Só com medidas ({withDimsCount} de {equipments.length})
                </label>
                <span className="text-xs font-medium text-green-700">{inLoad.size} na carga</span>
              </div>
            </div>
            <div className="overflow-y-auto divide-y flex-1">
              {filtered.map((e) => {
                const used = inLoad.has(e.id);
                return (
                  <label key={e.id} className={`px-3 py-2 flex items-center gap-2 cursor-pointer ${used ? "bg-green-50" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={used} onChange={() => toggleEquipment(e)} className="shrink-0" />
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        e.leaseStatus ? STATUS_DOT[e.leaseStatus] : isBasinEq(e) ? "bg-teal-500" : "bg-gray-300"
                      }`}
                      title={e.leaseStatus ? STATUS_LABEL[e.leaseStatus] : isBasinEq(e) ? "Bacia" : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 font-mono truncate">{e.equipmentNumber}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {hasDims(e) ? `${fmt(e.lengthM!)} × ${fmt(e.widthM!)} m` : <span className="text-amber-600">sem medidas</span>}
                        {" · "}
                        {e.weightKg != null ? fmtKg(e.weightKg) : <span className="text-amber-600">sem peso</span>}
                        {e.client ? ` · ${e.client}` : ""}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        className="p-1.5 rounded text-gray-400 hover:bg-gray-200"
                        title="Medidas e peso"
                        onClick={(ev) => {
                          ev.preventDefault();
                          setEditEqId(e.id);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </label>
                );
              })}
              {filtered.length === 0 && <div className="p-6 text-center text-sm text-gray-400">Nenhum equipamento encontrado.</div>}
            </div>
          </div>

          <div className="space-y-3 min-w-0">
            {/* ── barra de ações ── */}
            <div className="rounded-lg border bg-white p-3 flex items-center gap-2 flex-wrap">
              {multi ? (
                <>
                  <Button size="sm" className="bg-green-500 hover:bg-green-600 gap-1" disabled={items.length === 0} onClick={() => organize("FILL", 0)} title="Enche um veículo por vez: usa o mínimo de veículos">
                    <Wand2 className="w-4 h-4" /> Organizar: encher um por vez
                  </Button>
                  <Button size="sm" className="bg-green-500 hover:bg-green-600 gap-1" disabled={items.length === 0} onClick={() => organize("BALANCE", 0)} title="Reparte entre todos os veículos, deixando o peso parecido">
                    <Wand2 className="w-4 h-4" /> Organizar: equilibrar o peso
                  </Button>
                </>
              ) : (
                <Button size="sm" className="bg-green-500 hover:bg-green-600 gap-1" disabled={items.length === 0} onClick={() => organize("FILL", 0)}>
                  <Wand2 className="w-4 h-4" /> Organizar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={!lastOrg || items.length === 0}
                onClick={() => lastOrg && organize(lastOrg.mode, lastOrg.variant + 1)}
                title="Refaz o último Organizar com outro arranjo possível"
              >
                <Shuffle className="w-4 h-4" /> Outra sugestão
              </Button>
              <Button size="sm" variant="outline" className="gap-1" disabled={totals.loaded === 0} onClick={copySummary}>
                <ClipboardCopy className="w-4 h-4" /> Copiar resumo
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-gray-500" disabled={items.length === 0} onClick={clearAll}>
                <X className="w-4 h-4" /> Limpar
              </Button>
              {multi && (
                <div className="ml-auto text-xs text-gray-600">
                  <b>{totals.loaded}</b> carregado(s) em <b>{totals.used}</b> de {slotInfos.length} veículos · <b>{fmtKg(totals.weight)}</b>
                  {totals.out > 0 && <span className="text-red-600 font-medium"> · {totals.out} sem lugar</span>}
                </div>
              )}
            </div>

            {/* ── sem veículo ── */}
            {(multi || poolItems.length > 0) && (
              <div
                data-pool-drop=""
                className={`rounded-lg border-2 border-dashed p-3 ${hover?.target === POOL ? "border-green-500 bg-green-50" : "border-gray-300 bg-white"}`}
              >
                <div className="text-sm font-medium text-gray-700 mb-1">Sem veículo ({poolItems.length})</div>
                {poolItems.length === 0 ? (
                  <div className="text-xs text-gray-400">
                    Os equipamentos marcados na lista aparecem aqui até serem colocados num veículo (por &quot;Organizar&quot;, pelo seletor de cada item ou arrastando).
                    Você também pode arrastar um item de um veículo pra cá.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {poolItems.map((u) => {
                      const info = poolSelect(u);
                      return (
                        <span key={u.uid} className="inline-flex items-center gap-1.5 text-xs bg-white border rounded px-2 py-1">
                          <span className="font-mono font-semibold">{info.code}</span>
                          {info.weight > 0 && <span className="text-gray-400">{fmtKg(info.weight)}</span>}
                          <select
                            className="border rounded px-1 py-0.5 text-xs bg-white"
                            value=""
                            onChange={(ev) => ev.target.value && transfer(u.uid, ev.target.value)}
                          >
                            <option value="">colocar em…</option>
                            {slotInfos.map((s) => (
                              <option key={s.cfg.key} value={s.cfg.key}>
                                {slotLabel(s)}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => removeItem(u.uid)} className="text-gray-400 hover:text-red-600" title="Tirar da carga">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── uma carroceria por veículo ── */}
            {slotInfos.map((s) => (
              <BedPanel
                key={s.cfg.key}
                info={s}
                total={slotInfos.length}
                vehicles={vehicles}
                readOnly={readOnly}
                items={itemsBySlot.get(s.cfg.key) ?? []}
                allItems={items}
                setAllItems={setItems}
                equipments={equipments}
                eqById={eqById}
                selected={selected}
                setSelected={setSelected}
                summary={summaries.get(s.cfg.key)!}
                otherSlots={slotInfos.filter((o) => o.cfg.key !== s.cfg.key).map((o) => ({ key: o.cfg.key, label: slotLabel(o) }))}
                hoverTarget={hover?.target ?? null}
                setHover={setHover}
                slotLabelOf={(key) => {
                  const o = slotInfos.find((x) => x.cfg.key === key);
                  return o ? slotLabel(o) : "outro veículo";
                }}
                onTransfer={transfer}
                onRemoveItem={removeItem}
                onChangeVehicle={(vid) => changeSlotVehicle(s.cfg.key, vid)}
                onOverhang={(patch) => changeOverhang(s.cfg.key, patch)}
                onRemoveSlot={() => removeSlot(s.cfg.key)}
              />
            ))}
          </div>
        </div>
      )}

      {hover && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1 rounded bg-gray-900 text-white text-xs shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <span className="font-mono font-semibold">{hover.label}</span> → {hover.targetLabel}
        </div>
      )}

      {!readOnly && vehicleDialog && (
        <VehiclesDialog
          initial={vehicles}
          onClose={() => setVehicleDialog(false)}
          onSaved={async () => {
            setVehicleDialog(false);
            await load();
          }}
        />
      )}
      {!readOnly && editEqId && eqById.get(editEqId) && (
        <EquipmentDialog
          eq={eqById.get(editEqId)!}
          onClose={() => setEditEqId(null)}
          onSaved={async () => {
            setEditEqId(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ═══ Carroceria de um veículo ═══════════════════════════════════════════════
type PanelProps = {
  info: SlotInfo;
  total: number;
  vehicles: Vehicle[];
  readOnly: boolean;
  items: Item[]; // só os desta carroceria
  allItems: Item[];
  setAllItems: React.Dispatch<React.SetStateAction<Item[]>>;
  equipments: Eq[];
  eqById: Map<string, Eq>;
  selected: string | null;
  setSelected: (uid: string | null) => void;
  summary: Summary;
  otherSlots: { key: string; label: string }[];
  hoverTarget: string | null;
  setHover: (h: Hover) => void;
  slotLabelOf: (key: string) => string;
  onTransfer: (uid: string, target: string | null, drop?: { x: number; y: number }) => boolean;
  onRemoveItem: (uid: string) => void;
  onChangeVehicle: (vehicleId: string) => void;
  onOverhang: (patch: Partial<Pick<SlotCfg, "overhangOn" | "overhangStr">>) => void;
  onRemoveSlot: () => void;
};

function BedPanel(p: PanelProps) {
  const { info, items, allItems, setAllItems, eqById, selected, setSelected, summary, readOnly, equipments } = p;
  const { cfg, vehicle, bed, overhangM } = info;
  const key = cfg.key;

  // atualiza só os itens desta carroceria (mantém a ordem dos demais)
  const setItems = useCallback(
    (update: (mine: Item[]) => Item[]) =>
      setAllItems((all) => {
        const mineIds = new Set(all.filter((i) => i.slot === key).map((i) => i.uid));
        const next = update(all.filter((i) => mineIds.has(i.uid)));
        const nextById = new Map(next.map((i) => [i.uid, i]));
        const out = all.flatMap((i) => (mineIds.has(i.uid) ? (nextById.has(i.uid) ? [nextById.get(i.uid)!] : []) : [i]));
        for (const n of next) if (!mineIds.has(n.uid)) out.push(n);
        return out;
      }),
    [setAllItems, key]
  );

  // ── retângulos dos itens já posicionados ──
  const rectOf = useCallback((it: Item): Rect | null => rectOfItem(it, eqById), [eqById]);
  const placedRects = useCallback(
    (exceptUid?: string) => items.filter((i) => i.uid !== exceptUid).map(rectOf).filter((r): r is Rect => r !== null),
    [items, rectOf]
  );

  // ── largura disponível → escala (px por metro) ──
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  useEffect(() => {
    if (!boxRef.current) return;
    const ro = new ResizeObserver((entries) => setBoxW(entries[0].contentRect.width));
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);
  const scale = Math.max(14, Math.min(160, (boxW - 40) / (bed.lengthM + overhangM)));

  // ── arrastar ──
  const dragRef = useRef<{ uid: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<{ uid: string; x: number; y: number } | null>(null);
  const hoverActive = useRef(false);

  // o que está embaixo do ponteiro: esta carroceria, outra carroceria, o "sem veículo" ou nada
  const targetUnder = (cx: number, cy: number) => {
    for (const el of document.elementsFromPoint(cx, cy)) {
      const h = el as HTMLElement;
      const bk = h.dataset?.bedKey;
      if (bk) return bk === key ? ({ kind: "own" } as const) : ({ kind: "slot", key: bk, el: h } as const);
      if (h.dataset && "poolDrop" in h.dataset) return { kind: "pool" } as const;
    }
    return null;
  };

  const snapped = useCallback(
    (uid: string, x: number, y: number, w: number, h: number) => {
      const others = placedRects(uid);
      const near = (value: number, targets: number[]) => {
        let best = value;
        let bestD = SNAP_M;
        for (const t of targets) {
          const d = Math.abs(t - value);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        return best;
      };
      const xs = [0, bed.lengthM - w, ...others.flatMap((o) => [o.x + o.w, o.x - w, o.x, o.x + o.w - w])];
      const ys = [0, bed.widthM - h, ...others.flatMap((o) => [o.y + o.h, o.y - h, o.y, o.y + o.h - h])];
      return { x: near(x, xs), y: near(y, ys) };
    },
    [bed, placedRects]
  );

  const onPointerDown = (e: React.PointerEvent, it: Item) => {
    if (it.x == null || it.y == null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { uid: it.uid, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
    setSelected(it.uid);
  };
  const onPointerMove = (e: React.PointerEvent, it: Item) => {
    const d = dragRef.current;
    const eq = eqById.get(it.eqId);
    if (!d || d.uid !== it.uid || !eq || !hasDims(eq)) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (!d.moved && Math.hypot(dx, dy) * scale < 3) return;
    d.moved = true;
    const { w, h } = itemSize(eq, it.rotated);
    setDrag({ uid: it.uid, ...snapped(it.uid, d.ox + dx, d.oy + dy, w, h) });
    // por cima de outro veículo (ou do "sem veículo"): mostra pra onde vai
    const t = targetUnder(e.clientX, e.clientY);
    if (t && t.kind !== "own") {
      hoverActive.current = true;
      p.setHover({
        target: t.kind === "pool" ? POOL : t.key,
        targetLabel: t.kind === "pool" ? "Sem veículo" : p.slotLabelOf(t.key),
        x: e.clientX,
        y: e.clientY,
        label: eq.equipmentNumber,
      });
    } else if (hoverActive.current) {
      hoverActive.current = false;
      p.setHover(null);
    }
  };
  const onPointerUp = (e: React.PointerEvent, it: Item) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (hoverActive.current) {
      hoverActive.current = false;
      p.setHover(null);
    }
    if (!d || d.uid !== it.uid || !drag || drag.uid !== it.uid) {
      setDrag(null);
      return;
    }
    const eq = eqById.get(it.eqId);
    if (eq && hasDims(eq)) {
      const { w, h } = itemSize(eq, it.rotated);
      // soltou em cima de outro veículo / do "sem veículo": muda de lugar
      const t = targetUnder(e.clientX, e.clientY);
      if (t && t.kind !== "own") {
        setDrag(null);
        if (t.kind === "pool") {
          p.onTransfer(it.uid, null);
        } else {
          const rect = t.el.getBoundingClientRect();
          const ts = Number(t.el.dataset.scale) || 1;
          // 2 = borda da carroceria
          p.onTransfer(it.uid, t.key, { x: (e.clientX - rect.left - 2) / ts - w / 2, y: (e.clientY - rect.top - 2) / ts - h / 2 });
        }
        return;
      }
      const r = { x: drag.x, y: drag.y, w, h };
      // soltou o gerador com o centro em cima de uma bacia: entra na bacia
      if (!isBasinEq(eq)) {
        const cx = r.x + w / 2;
        const cy = r.y + h / 2;
        const target = items.find((b) => {
          const be = eqById.get(b.eqId);
          const br = rectOf(b);
          return b.uid !== it.uid && isBasinEq(be) && br && cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h;
        });
        if (target) {
          nestInto(it, eq, target.uid);
          setDrag(null);
          return;
        }
      }
      if (isValidPlacement(r, placedRects(it.uid), bed)) {
        setItems((all) => all.map((i) => (i.uid === it.uid ? { ...i, x: drag.x, y: drag.y } : i)));
      } else {
        toast.error("Aí não dá: bate em outro equipamento ou passa da carroceria.");
      }
    }
    setDrag(null);
  };

  // ── gerador dentro da bacia: arrastar ──
  // 1 clique e arrasta: leva só o gerador (sai da bacia; se soltar em cima de uma bacia, entra nela).
  // 2 cliques (o 2º segurando) e arrasta: leva a bacia junto com o gerador.
  const genGesture = useRef<{ uid: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; unit: boolean } | null>(null);
  const lastGenTap = useRef<{ uid: string; t: number } | null>(null);
  const [genDrag, setGenDrag] = useState<{ uid: string; x: number; y: number } | null>(null);

  const onGenDown = (e: React.PointerEvent, gen: Item, basin: Item, basinRect: Rect) => {
    e.stopPropagation();
    const ge = eqById.get(gen.eqId);
    if (!ge || !hasDims(ge)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const tap = lastGenTap.current;
    const unit = !!tap && tap.uid === gen.uid && Date.now() - tap.t < 450;
    lastGenTap.current = null;
    if (unit) {
      genGesture.current = { uid: gen.uid, sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, moved: false, unit: true };
      onPointerDown(e, basin);
      return;
    }
    const { gw, gh } = genScreenDims(basin, gen, ge);
    genGesture.current = {
      uid: gen.uid,
      sx: e.clientX,
      sy: e.clientY,
      ox: basinRect.x + (basinRect.w - gw) / 2,
      oy: basinRect.y + (basinRect.h - gh) / 2,
      moved: false,
      unit: false,
    };
    setSelected(gen.uid);
  };

  const onGenMove = (e: React.PointerEvent, gen: Item, basin: Item) => {
    const g = genGesture.current;
    if (!g || g.uid !== gen.uid) return;
    if (g.unit) {
      onPointerMove(e, basin);
      return;
    }
    const dx = (e.clientX - g.sx) / scale;
    const dy = (e.clientY - g.sy) / scale;
    if (!g.moved && Math.hypot(dx, dy) * scale < 3) return;
    g.moved = true;
    setGenDrag({ uid: gen.uid, x: g.ox + dx, y: g.oy + dy });
  };

  const onGenUp = (e: React.PointerEvent, gen: Item, basin: Item) => {
    const g = genGesture.current;
    genGesture.current = null;
    if (!g || g.uid !== gen.uid) return;
    if (g.unit) {
      onPointerUp(e, basin);
      return;
    }
    const drop = genDrag;
    setGenDrag(null);
    if (!g.moved || !drop || drop.uid !== gen.uid) {
      // só um clique: guarda o instante, pra detectar o "2 cliques e arrasta"
      lastGenTap.current = { uid: gen.uid, t: Date.now() };
      return;
    }
    const ge = eqById.get(gen.eqId);
    if (!ge || !hasDims(ge)) return;
    const { gw, gh } = genScreenDims(basin, gen, ge);
    const cx = drop.x + gw / 2;
    const cy = drop.y + gh / 2;
    // soltou com o centro em cima de uma bacia: entra nela (a mesma = fica onde estava)
    const over = items.find((b) => {
      const br = rectOf(b);
      return b.uid !== gen.uid && isBasinEq(eqById.get(b.eqId)) && br && cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h;
    });
    if (over) {
      if (over.uid !== basin.uid) nestInto(gen, ge, over.uid);
      return;
    }
    const r = { x: drop.x, y: drop.y, w: gw, h: gh };
    if (isValidPlacement(r, placedRects(), bed)) {
      const rotatedFlag = !!gen.inRot !== !!basin.rotated;
      setItems((all) =>
        all.map((i) => (i.uid === gen.uid ? { ...i, inBasin: undefined, inRot: undefined, x: drop.x, y: drop.y, rotated: rotatedFlag } : i))
      );
      setSelected(gen.uid);
    } else {
      toast.error("Aí não dá: bate em outro equipamento ou passa da carroceria. O gerador ficou na bacia.");
    }
  };

  // ── ações ──
  const rotate = useCallback(
    (rawUid: string) => {
      // gerador dentro da bacia: quem gira é a bacia (levando o gerador junto)
      const uid = items.find((i) => i.uid === rawUid)?.inBasin ?? rawUid;
      const it = items.find((i) => i.uid === uid);
      const eq = it && eqById.get(it.eqId);
      if (!it || !eq || !hasDims(eq)) return;
      if (it.x == null || it.y == null) {
        setItems((all) => all.map((i) => (i.uid === uid ? { ...i, rotated: !i.rotated } : i)));
        return;
      }
      const cur = itemSize(eq, it.rotated);
      const next = itemSize(eq, !it.rotated);
      // gira em torno do centro e encosta de volta dentro da carroceria
      const x = Math.min(Math.max(0, it.x + (cur.w - next.w) / 2), Math.max(0, bed.lengthM - next.w));
      const y = Math.min(Math.max(0, it.y + (cur.h - next.h) / 2), Math.max(0, bed.widthM - next.h));
      if (isValidPlacement({ x, y, ...next }, placedRects(uid), bed)) {
        setItems((all) => all.map((i) => (i.uid === uid ? { ...i, x, y, rotated: !i.rotated } : i)));
      } else {
        toast.error("Não cabe girado nesse lugar. Mova ou tire o vizinho antes.");
      }
    },
    [items, eqById, bed, placedRects, setItems]
  );

  // ── gerador sobre a bacia ──
  const nestInto = (genItem: Item | null, genEq: Eq, basinUid: string): boolean => {
    const basin = items.find((i) => i.uid === basinUid);
    const be = basin && eqById.get(basin.eqId);
    if (!basin || !be || !isBasinEq(be)) return false;
    if (isBasinEq(genEq)) {
      toast.error("Só gerador vai em cima de bacia.");
      return false;
    }
    if (allItems.some((i) => i.inBasin === basinUid && i.uid !== genItem?.uid)) {
      toast.error(`A bacia ${be.equipmentNumber} já está com um gerador.`);
      return false;
    }
    if (!hasDims(be) || !hasDims(genEq)) {
      toast.error("Faltam as medidas da bacia ou do gerador.");
      return false;
    }
    const fit = basinFit(genEq, be);
    if (fit === null) {
      toast.error(
        `${genEq.equipmentNumber} (${fmt(genEq.lengthM!)} × ${fmt(genEq.widthM!)} m) não cabe dentro da bacia ${be.equipmentNumber} (${fmt(be.lengthM!)} × ${fmt(be.widthM!)} m).`
      );
      return false;
    }
    // o gerador pode estar em outro veículo (ou sem veículo): passa a ser deste, junto com a bacia
    if (genItem) {
      setAllItems((all) =>
        all.map((i) => (i.uid === genItem.uid ? { ...i, slot: key, x: null, y: null, rotated: false, inBasin: basinUid, inRot: fit } : i))
      );
    } else {
      setAllItems((all) => [
        ...all,
        { uid: `${genEq.id}-${Date.now()}`, eqId: genEq.id, slot: key, x: null, y: null, rotated: false, inBasin: basinUid, inRot: fit },
      ]);
    }
    setSelected(basinUid);
    return true;
  };

  // tira o gerador de cima da bacia e procura outro lugar pra ele na carroceria
  const unnest = (uid: string) => {
    const it = items.find((i) => i.uid === uid);
    const eq = it && eqById.get(it.eqId);
    if (!it || !eq || !hasDims(eq)) return;
    const size = { w: eq.lengthM as number, h: eq.widthM as number };
    const spot =
      findSpot(size, placedRects(), { lengthM: bed.lengthM, widthM: bed.widthM }) ??
      (overhangM > 0 ? findSpot(size, placedRects(), bed) : null);
    setItems((all) =>
      all.map((i) =>
        i.uid === uid
          ? { ...i, inBasin: undefined, inRot: undefined, x: spot?.x ?? null, y: spot?.y ?? null, rotated: spot?.rotated ?? false }
          : i
      )
    );
    if (!spot) toast.error(`${eq.equipmentNumber} não coube na carroceria sozinho. Ficou em "Ficaram de fora".`);
    setSelected(uid);
  };

  // atalhos: R gira, Delete tira o equipamento selecionado (só age na carroceria onde ele está)
  const selMine = items.find((i) => i.uid === selected) ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!selMine || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "r" || e.key === "R") rotate(selMine.uid);
      if (e.key === "Delete" || e.key === "Backspace") p.onRemoveItem(selMine.uid);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selMine, rotate, p.onRemoveItem]);

  const overCapacity = !!(vehicle.capacityKg && summary.weight > vehicle.capacityKg);

  // bacia relacionada ao item selecionado (a própria bacia, ou a bacia que leva o gerador selecionado)
  const selEq = selMine ? eqById.get(selMine.eqId) : undefined;
  const basinItem = selMine ? (selMine.inBasin ? items.find((i) => i.uid === selMine.inBasin) : isBasinEq(selEq) ? selMine : null) ?? null : null;
  const basinEq = basinItem ? eqById.get(basinItem.eqId) : undefined;
  const nestedItem = basinItem ? items.find((i) => i.inBasin === basinItem.uid) ?? null : null;
  const nestCandidates =
    basinEq && isBasinEq(basinEq) && !nestedItem
      ? equipments.filter((g) => !isBasinEq(g) && hasDims(g) && basinFit(g, basinEq) !== null)
      : [];
  const selUnitUid = selMine ? selMine.inBasin ?? selMine.uid : null;
  const hovered = p.hoverTarget === key;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border bg-white p-3 ${hovered ? "ring-2 ring-green-500" : ""}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
            {p.total > 1 && <span className="text-xs font-semibold bg-gray-900 text-white rounded px-1.5 py-0.5">{info.idx + 1}</span>}
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-white font-semibold text-gray-900"
              value={vehicle.id}
              onChange={(e) => p.onChangeVehicle(e.target.value)}
            >
              {p.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({fmt(v.lengthM)} × {fmt(v.widthM)} m)
                </option>
              ))}
            </select>
            <span>
              carroceria {fmt(vehicle.lengthM)} × {fmt(vehicle.widthM)} m
              {vehicle.heightM ? ` · altura ${fmt(vehicle.heightM)} m` : ""}
            </span>
            {p.total > 1 && (
              <button className="text-xs text-gray-400 hover:text-red-600 underline" onClick={p.onRemoveSlot} title="Tira este veículo da carga; os itens voltam pra Sem veículo">
                tirar veículo
              </button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" disabled={!selMine} onClick={() => selMine && rotate(selMine.uid)}>
              <RotateCw className="w-4 h-4" /> Girar 90°
            </Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={!selMine} onClick={() => selMine && p.onRemoveItem(selMine.uid)}>
              <Trash2 className="w-4 h-4" /> Tirar
            </Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={!nestedItem} onClick={() => nestedItem && unnest(nestedItem.uid)}>
              <ArrowUpFromLine className="w-4 h-4" /> Tirar da bacia
            </Button>
            {p.total > 1 && (
              <select
                className="border rounded-md px-2 py-1 text-sm bg-white disabled:opacity-50"
                value=""
                disabled={!selMine}
                onChange={(e) => {
                  if (!selUnitUid || !e.target.value) return;
                  p.onTransfer(selUnitUid, e.target.value === POOL ? null : e.target.value);
                }}
              >
                <option value="">Mover para…</option>
                {p.otherSlots.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
                <option value={POOL}>Sem veículo</option>
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-2 text-sm">
          <label className="inline-flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={cfg.overhangOn} onChange={(e) => p.onOverhang({ overhangOn: e.target.checked })} />
            Permitir sair da carroceria
          </label>
          {cfg.overhangOn && (
            <label className="inline-flex items-center gap-1 text-gray-600">
              até
              <Input className="w-20 h-8" inputMode="decimal" value={cfg.overhangStr} onChange={(e) => p.onOverhang({ overhangStr: e.target.value })} />
              m (atrás e nas laterais)
            </label>
          )}
        </div>

        {basinEq && basinItem && isBasinEq(basinEq) && (
          <div className="flex items-center gap-2 flex-wrap mb-2 text-sm bg-teal-50 border border-teal-200 rounded px-2 py-1.5">
            <span className="text-teal-900">
              Bacia <b>{basinEq.equipmentNumber}</b> ({fmt(basinEq.lengthM ?? 0)} × {fmt(basinEq.widthM ?? 0)} m)
            </span>
            {nestedItem ? (
              <span className="text-teal-900">
                · gerador em cima: <b>{eqById.get(nestedItem.eqId)?.equipmentNumber}</b>
              </span>
            ) : nestCandidates.length > 0 ? (
              <select
                className="border rounded-md px-2 py-1 text-sm bg-white"
                value=""
                onChange={(e) => {
                  const g = eqById.get(e.target.value);
                  if (g) nestInto(allItems.find((i) => i.eqId === g.id) ?? null, g, basinItem.uid);
                }}
              >
                <option value="">Colocar gerador nesta bacia…</option>
                {nestCandidates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.equipmentNumber} ({fmt(g.lengthM!)} × {fmt(g.widthM!)} m)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-teal-800">Nenhum gerador cadastrado cabe nesta bacia (ou faltam medidas).</span>
            )}
          </div>
        )}

        <div ref={boxRef} className="w-full overflow-x-auto">
          <div
            className="flex items-stretch"
            style={{ padding: `${overhangM * scale}px ${overhangM * scale}px ${overhangM * scale}px 0` }}
          >
            <div className="flex items-center justify-center text-[10px] font-semibold text-gray-400 tracking-widest [writing-mode:vertical-rl] rotate-180 pr-1">
              CABINE
            </div>
            <div
              data-bed-key={key}
              data-scale={scale}
              className="relative border-2 border-gray-700 bg-gray-50 shrink-0"
              style={{
                width: vehicle.lengthM * scale,
                height: vehicle.widthM * scale,
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.07) 1px, transparent 1px)",
                backgroundSize: `${scale}px ${scale}px`,
              }}
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            >
              {overhangM > 0 && (
                <div
                  className="absolute border-2 border-dashed border-amber-400 bg-amber-50/40 pointer-events-none"
                  style={{
                    left: -2,
                    top: -overhangM * scale - 2,
                    right: -overhangM * scale - 2,
                    bottom: -overhangM * scale - 2,
                  }}
                  title={`Folga permitida pra fora: ${fmt(overhangM)} m`}
                />
              )}
              {summary.cg != null && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-500 pointer-events-none"
                  style={{ left: summary.cg * vehicle.lengthM * scale }}
                  title="Centro de gravidade (pelo peso informado)"
                />
              )}
              {items.map((it) => {
                const e = eqById.get(it.eqId);
                const base = rectOf(it);
                if (!e || !base) return null;
                const dragging = drag?.uid === it.uid;
                const r = dragging ? { ...base, x: drag!.x, y: drag!.y } : base;
                const valid = isValidPlacement(r, placedRects(it.uid), bed);
                const tall = !!(vehicle.heightM && e.heightM != null && e.heightM > vehicle.heightM);
                const out = overhangOf(r, bed).any;
                const nestedHere = items.find((x) => x.inBasin === it.uid);
                const ne = nestedHere ? eqById.get(nestedHere.eqId) : undefined;
                return (
                  <div
                    key={it.uid}
                    onPointerDown={(ev) => onPointerDown(ev, it)}
                    onPointerMove={(ev) => onPointerMove(ev, it)}
                    onPointerUp={(ev) => onPointerUp(ev, it)}
                    onDoubleClick={() => rotate(it.uid)}
                    className={`absolute rounded-sm text-white select-none overflow-hidden flex flex-col items-center ${
                      ne ? "justify-start" : "justify-center"
                    } text-center leading-tight ${
                      dragging ? "cursor-grabbing z-20 opacity-90" : "cursor-grab"
                    } ${selected === it.uid ? "ring-2 ring-offset-1 ring-gray-900 z-10" : ""}`}
                    style={{
                      left: r.x * scale,
                      top: r.y * scale,
                      width: r.w * scale,
                      height: r.h * scale,
                      background: valid ? itemColor(e.equipmentNumber) : "#dc2626",
                      border: tall ? "2px dashed #fbbf24" : "1px solid rgba(255,255,255,.7)",
                      boxShadow: out ? "0 0 0 2px #f59e0b" : undefined,
                      touchAction: "none",
                    }}
                    title={`${e.equipmentNumber} · ${fmt(r.w)} × ${fmt(r.h)} m${e.weightKg != null ? ` · ${fmtKg(e.weightKg)}` : ""}${tall ? " · mais alto que a carroceria" : ""}`}
                  >
                    <span className="text-[11px] font-bold px-0.5">{e.equipmentNumber}</span>
                    {r.w * scale > 70 && r.h * scale > 34 && !ne && (
                      <span className="text-[10px] opacity-90">
                        {fmt(r.w)}×{fmt(r.h)}{e.weightKg != null ? ` · ${Math.round(e.weightKg)}kg` : ""}
                      </span>
                    )}
                    {nestedHere && ne && hasDims(ne) && (() => {
                      // gerador dentro da bacia, centralizado; acompanha o giro da bacia
                      const { gw, gh } = genScreenDims(it, nestedHere, ne);
                      const lifted = genDrag?.uid === nestedHere.uid;
                      return (
                        <div
                          onPointerDown={(ev) => onGenDown(ev, nestedHere, it, base)}
                          onPointerMove={(ev) => onGenMove(ev, nestedHere, it)}
                          onPointerUp={(ev) => onGenUp(ev, nestedHere, it)}
                          onDoubleClick={(ev) => ev.stopPropagation()}
                          className={`absolute rounded-sm flex flex-col items-center justify-center text-center leading-tight cursor-grab select-none ${
                            selected === nestedHere.uid ? "ring-2 ring-gray-900" : ""
                          } ${lifted ? "opacity-30" : ""}`}
                          style={{
                            left: ((r.w - gw) / 2) * scale,
                            top: ((r.h - gh) / 2) * scale + 6,
                            width: gw * scale,
                            height: gh * scale,
                            background: itemColor(ne.equipmentNumber),
                            border: "1px solid rgba(255,255,255,.85)",
                            touchAction: "none",
                          }}
                          title={`${ne.equipmentNumber} sobre a bacia ${e.equipmentNumber}${ne.weightKg != null ? ` · ${fmtKg(ne.weightKg)}` : ""} · arraste: só o gerador · 2 cliques e arraste: gerador + bacia`}
                        >
                          <span className="text-[11px] font-bold px-0.5">{ne.equipmentNumber}</span>
                          {gw * scale > 70 && gh * scale > 30 && (
                            <span className="text-[10px] opacity-90">{fmt(gw)}×{fmt(gh)}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {genDrag && (() => {
                const gi = items.find((i) => i.uid === genDrag.uid);
                const ge = gi && eqById.get(gi.eqId);
                const bi = gi?.inBasin ? items.find((i) => i.uid === gi.inBasin) : undefined;
                if (!gi || !ge || !bi || !hasDims(ge)) return null;
                const { gw, gh } = genScreenDims(bi, gi, ge);
                const cx = genDrag.x + gw / 2;
                const cy = genDrag.y + gh / 2;
                const over = items.find((b) => {
                  const br = rectOf(b);
                  return b.uid !== gi.uid && isBasinEq(eqById.get(b.eqId)) && br && cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h;
                });
                const overEq = over && eqById.get(over.eqId);
                const ok = over
                  ? over.uid === bi.uid || (!allItems.some((i) => i.inBasin === over.uid) && !!overEq && basinFit(ge, overEq) !== null)
                  : isValidPlacement({ x: genDrag.x, y: genDrag.y, w: gw, h: gh }, placedRects(), bed);
                return (
                  <div
                    className="absolute rounded-sm text-white flex items-center justify-center text-[11px] font-bold pointer-events-none z-30"
                    style={{
                      left: genDrag.x * scale,
                      top: genDrag.y * scale,
                      width: gw * scale,
                      height: gh * scale,
                      background: ok ? itemColor(ge.equipmentNumber) : "#dc2626",
                      opacity: 0.9,
                      outline: over && ok ? "3px solid #0d9488" : undefined,
                      border: "1px solid rgba(255,255,255,.85)",
                    }}
                  >
                    {ge.equipmentNumber}
                  </div>
                );
              })()}
              {items.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none text-center px-2">
                  {p.total > 1 ? "Use \"Organizar\" ou arraste itens pra cá" : "Marque equipamentos na lista à esquerda"}
                </div>
              )}
            </div>
          </div>
          {info.idx === 0 && (
            <div className="text-[10px] text-gray-400 mt-1 pl-4">
              Cada quadradinho = 1 m · duplo clique gira 90° · tecla R gira · Delete tira · gerador na bacia: arraste para mover só o gerador, ou dê 2 cliques (segurando no 2º) e arraste para levar bacia + gerador · solte o gerador em cima de uma bacia para colocá-lo dentro
              {p.total > 1 ? " · arraste um equipamento pra outro veículo para mudar de caminhão" : ""}
            </div>
          )}
        </div>
      </div>

      {summary.pending.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-sm font-medium text-red-700 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Ficaram de fora{p.total > 1 ? ` do veículo ${info.idx + 1}` : ""}: sem espaço ou acima da capacidade ({summary.pending.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.pending.map((it) => {
              const e = eqById.get(it.eqId);
              return (
                <span key={it.uid} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 rounded px-2 py-1 font-mono">
                  {e?.equipmentNumber}
                  <button onClick={() => p.onRemoveItem(it.uid)} className="text-gray-400 hover:text-red-600" title="Tirar da carga">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white p-3 grid gap-4 sm:grid-cols-3 text-sm">
        <div>
          <div className="text-xs text-gray-500 mb-1">Piso ocupado</div>
          <div className="font-semibold text-gray-900">{Math.round(summary.areaPct * 100)}%</div>
          <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${Math.min(100, summary.areaPct * 100)}%` }} />
          </div>
          <div className="text-xs text-gray-500 mt-1">{summary.placed.length + summary.nestedPlaced.length} item(ns) na carga</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Peso</div>
          <div className={`font-semibold ${overCapacity ? "text-red-600" : "text-gray-900"}`}>
            {fmtKg(summary.weight)}
            {vehicle.capacityKg ? ` de ${fmtKg(vehicle.capacityKg)}` : ""}
          </div>
          {vehicle.capacityKg ? (
            <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
              <div className={`h-full ${overCapacity ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, (summary.weight / vehicle.capacityKg) * 100)}%` }} />
            </div>
          ) : (
            <div className="text-xs text-gray-500 mt-1">Veículo sem capacidade informada.</div>
          )}
          {overCapacity && <div className="text-xs text-red-600 mt-1 font-medium">Acima da capacidade do veículo.</div>}
          {summary.noWeight > 0 && (
            <div className="text-xs text-amber-600 mt-1">{summary.noWeight} equipamento(s) sem peso informado (contam como 0).</div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Distribuição do peso</div>
          {summary.cg != null ? (
            <>
              <div className="relative h-2 bg-gray-100 rounded mt-2">
                <div className="absolute -top-1 w-1 h-4 bg-rose-500 rounded" style={{ left: `${summary.cg * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>cabine</span>
                <span>fundo</span>
              </div>
              <div className="text-xs text-gray-600 mt-1">Centro de gravidade a {Math.round(summary.cg * 100)}% do comprimento, contado da cabine.</div>
            </>
          ) : (
            <div className="text-xs text-gray-500">Informe o peso dos equipamentos para ver.</div>
          )}
        </div>
        {summary.overhanging.length > 0 && (
          <div className="sm:col-span-3 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1.5">
            <b>Carga fora da carroceria:</b> {summary.overhanging.map((o) => `${o.code} (${o.text})`).join("; ")}. Exige
            atenção à sinalização e à legislação de trânsito — confirme com o motorista antes de sair.
          </div>
        )}
        {summary.tooTall.length > 0 && (
          <div className="sm:col-span-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Mais altos que a altura útil informada ({fmt(vehicle.heightM!)} m): {summary.tooTall.map((t) => t.e.equipmentNumber).join(", ")}.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Cadastro de veículos ═══════════════════════════════════════════════════
type VRow = { id: string; name: string; lengthM: string; widthM: string; heightM: string; capacityKg: string };
const toRow = (v: Vehicle): VRow => ({
  id: v.id,
  name: v.name,
  lengthM: String(v.lengthM).replace(".", ","),
  widthM: String(v.widthM).replace(".", ","),
  heightM: v.heightM != null ? String(v.heightM).replace(".", ",") : "",
  capacityKg: v.capacityKg != null ? String(v.capacityKg) : "",
});

function VehiclesDialog({ initial, onClose, onSaved }: { initial: Vehicle[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<VRow[]>(initial.length ? initial.map(toRow) : [{ id: "", name: "", lengthM: "", widthM: "", heightM: "", capacityKg: "" }]);
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<VRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/carga/veiculos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicles: rows
            .filter((r) => r.name.trim() || r.lengthM.trim() || r.widthM.trim())
            .map((r) => ({
              id: r.id || undefined,
              name: r.name,
              lengthM: r.lengthM,
              widthM: r.widthM,
              heightM: r.heightM.trim() ? r.heightM : null,
              capacityKg: r.capacityKg.trim() ? r.capacityKg : null,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar.");
        return;
      }
      toast.success("Veículos salvos.");
      onSaved();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Veículos</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          Medidas internas da carroceria, em metros (ex.: 6,20). Altura útil e capacidade são opcionais, mas ativam os avisos.
        </p>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr_auto] gap-2 text-xs font-medium text-gray-600 px-1">
            <span>Nome</span><span>Comprimento (m)</span><span>Largura (m)</span><span>Altura (m)</span><span>Capacidade (kg)</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr_auto] gap-2 items-center">
              <Input placeholder="Ex.: Caminhão baú" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
              <Input inputMode="decimal" value={r.lengthM} onChange={(e) => set(i, { lengthM: e.target.value })} />
              <Input inputMode="decimal" value={r.widthM} onChange={(e) => set(i, { widthM: e.target.value })} />
              <Input inputMode="decimal" value={r.heightM} onChange={(e) => set(i, { heightM: e.target.value })} />
              <Input inputMode="numeric" value={r.capacityKg} onChange={(e) => set(i, { capacityKg: e.target.value })} />
              <button className="p-2 text-gray-400 hover:text-red-600" title="Remover veículo" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1 w-fit" onClick={() => setRows((rs) => [...rs, { id: "", name: "", lengthM: "", widthM: "", heightM: "", capacityKg: "" }])}>
          <Plus className="w-4 h-4" /> Adicionar veículo
        </Button>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-green-500 hover:bg-green-600" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Medidas e peso de um equipamento ═══════════════════════════════════════
function EquipmentDialog({ eq, onClose, onSaved }: { eq: Eq; onClose: () => void; onSaved: () => void }) {
  const init = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");
  const [length, setLength] = useState(init(eq.lengthM));
  const [width, setWidth] = useState(init(eq.widthM));
  const [height, setHeight] = useState(init(eq.heightM));
  const [weight, setWeight] = useState(init(eq.weightKg));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/carga/equipamento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // só envia o que foi alterado, pra não reescrever o cadastro à toa
        body: JSON.stringify({
          id: eq.id,
          ...(length !== init(eq.lengthM) ? { lengthM: length } : {}),
          ...(width !== init(eq.widthM) ? { widthM: width } : {}),
          ...(height !== init(eq.heightM) ? { heightM: height } : {}),
          ...(weight !== init(eq.weightKg) ? { weightKg: weight } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar.");
        return;
      }
      toast.success("Equipamento atualizado.");
      onSaved();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{eq.equipmentNumber} — medidas e peso</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          As medidas são gravadas no cadastro do equipamento (comprimento = lado maior, no sentido do caminhão). Em metros, ex.: 2,80.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Comprimento (m)</label>
            <Input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Largura (m)</label>
            <Input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Altura (m)</label>
            <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Peso (kg)</label>
            <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-green-500 hover:bg-green-600" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
